"""Event channel the dashboard subscribes to. LANE D owns the WebSocket surface.

The engine emits an event after every step so the climb animates live. Phase 0 ships an
in-memory channel (buffer + synchronous subscribers) the CLI and tests use directly; the
FastAPI WebSocket fan-out is wired in Phase 4 on top of the same `emit` contract.

Event shape (keep stable; the dashboard depends on it):
    {"type": str, "payload": dict, "ts": float}

Types: run_started · generation_started · variant_evaluated · generation_complete ·
champion_changed · mutation · guard · run_complete
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable

Subscriber = Callable[[dict], None]

# Bound memory growth across long-lived server processes / hammered /api/run.
_DEFAULT_MAX_EVENTS = 2000


class EventChannel:
    """Fan-out of engine events. Synchronous and dependency-free so the loop can call it from
    anywhere; the WS server registers itself as a subscriber."""

    def __init__(self, *, echo: bool = False, max_events: int = _DEFAULT_MAX_EVENTS):
        self.events: deque[dict] = deque(maxlen=max(1, max_events))
        self._subscribers: list[Subscriber] = []
        self._echo = echo

    def subscribe(self, fn: Subscriber) -> None:
        self._subscribers.append(fn)

    def unsubscribe(self, fn: Subscriber) -> None:
        """Remove a subscriber (a disconnected WebSocket client). Safe if already gone."""
        try:
            self._subscribers.remove(fn)
        except ValueError:
            pass

    def emit(self, event_type: str, payload: dict | None = None) -> None:
        event = {"type": event_type, "payload": payload or {}, "ts": time.time()}
        self.events.append(event)
        if self._echo:
            print(f"[{event_type}] {event['payload']}")
        for fn in self._subscribers:
            try:
                fn(event)
            except Exception:  # noqa: BLE001 - a bad subscriber must never break the loop
                pass
