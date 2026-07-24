"""FastAPI WebSocket event channel the dashboard subscribes to. LANE D owns this file.

Local so it survives flaky venue WiFi. The engine emits an event after every step
(variant evaluated, generation complete, champion changed, mutation diff, guard fired) so
the climb animates live.

Event shape (keep stable; the dashboard depends on it):
    { "type": "variant_evaluated" | "generation_complete" | "champion_changed"
              | "mutation" | "guard" | "run_complete",
      "payload": { ... },
      "ts": float }
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="Darwin events")


class EventChannel:
    """Fan-out of engine events to connected dashboard clients. TODO(Lane D)."""

    def __init__(self):
        self._clients: list = []

    async def broadcast(self, event: dict) -> None:
        raise NotImplementedError

    def emit(self, event_type: str, payload: dict) -> None:
        """Sync-friendly emit the engine can call from the loop. TODO(Lane D)."""
        raise NotImplementedError


channel = EventChannel()


@app.websocket("/ws")
async def ws(_websocket):  # noqa: ANN001
    """Dashboard subscribes here. TODO(Lane D): accept, register, stream events."""
    raise NotImplementedError
