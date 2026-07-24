"""FastAPI server: the live bridge between the engine and the dashboard (SPEC Phase 4).

    python -m darwin.server.app          # serve on :8000 (dashboard dev proxies /ws + /api)

Surfaces:
  * `WS /ws`        - streams engine events. On connect the full buffered history is replayed
                      first (late joiners see the whole run), then live events follow. Same
                      event shape as EventChannel: {"type", "payload", "ts"}.
  * `POST /api/run` - start an evolution run in a background thread. Body:
                      {"task": "coding_bench", "offline": false}. 409 if a run is active.
  * `GET /api/status` - {"running", "task", "events"} for the UI's live/cached badge.

Threading model: the engine runs in a plain daemon thread and emits synchronously; each WS
client gets an asyncio.Queue fed via loop.call_soon_threadsafe, so the sync engine never
touches the event loop directly. One EventChannel lives for the server's lifetime - history
accumulates across runs and `run_started` marks the boundaries.
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import fields, replace

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from darwin.config import Features, load_config
from darwin.eval.task import Task
from darwin.server.events import EventChannel

app = FastAPI(title="Darwin live server")

channel = EventChannel()
_run_lock = threading.Lock()
_run_state: dict = {"running": False, "task": None, "thread": None}


class RunRequest(BaseModel):
    task: str = "coding_bench"
    offline: bool = False


# --------------------------------------------------------------------- #
# Engine runner
# --------------------------------------------------------------------- #


def _run_engine(task_id: str, offline: bool) -> None:
    """Runs in a daemon thread; emits into the shared channel; always persists on success.

    `offline` overrides the Config object for THIS run only. It must never mutate
    os.environ: the server is long-lived and env vars are process-global, so a single
    offline=true request would permanently downgrade every later run (incl. ones the
    dashboard's "Run live" button sends with offline=false) to the local/canned path.
    """
    try:
        from darwin.main import build_engine, persist

        config = load_config()
        if offline:
            # field-agnostic all-off Features: survives flags being added/removed upstream
            config = replace(config, features=Features(**{f.name: False for f in fields(Features)}))
        task = Task.load(task_id)
        engine, sandboxes, _events = build_engine(config, task, events=channel)
        try:
            record = engine.run(task)
        finally:
            sandboxes.close()
        persist(record)
    except Exception as e:  # noqa: BLE001 - surface the failure to the UI, never crash the server
        channel.emit("run_failed", {"task": task_id, "error": str(e)[:300]})
    finally:
        _run_state["running"] = False
        _run_state["task"] = None


@app.post("/api/run")
def start_run(req: RunRequest) -> dict:
    with _run_lock:
        if _run_state["running"]:
            raise HTTPException(status_code=409, detail=f"run already active: {_run_state['task']}")
        try:
            Task.load(req.task)  # fail fast with a 400 before spawning the thread
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"unknown task {req.task!r}: {e}") from e
        _run_state["running"] = True
        _run_state["task"] = req.task
        thread = threading.Thread(
            target=_run_engine, args=(req.task, req.offline), daemon=True, name="darwin-run"
        )
        _run_state["thread"] = thread
        thread.start()
    return {"started": True, "task": req.task, "offline": req.offline}


@app.get("/api/status")
def status() -> dict:
    return {
        "running": _run_state["running"],
        "task": _run_state["task"],
        "events": len(channel.events),
    }


# --------------------------------------------------------------------- #
# WebSocket fan-out
# --------------------------------------------------------------------- #


@app.websocket("/ws")
async def ws_events(ws: WebSocket) -> None:
    await ws.accept()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    def push(event: dict) -> None:  # called from the engine thread
        loop.call_soon_threadsafe(queue.put_nowait, event)

    # subscribe FIRST, then snapshot: an event emitted in between lands in both the queue and
    # the captured history, so dedupe by object identity (emit stores and forwards the same
    # dict object). The reverse order would silently drop events.
    channel.subscribe(push)
    history = list(channel.events)
    seen = {id(e) for e in history}
    try:
        for event in history:
            await ws.send_json({**event, "replay": True})
        while True:
            event = await queue.get()
            if id(event) in seen:
                continue
            await ws.send_json(event)
    except (WebSocketDisconnect, RuntimeError, OSError):
        # A gone client surfaces as WebSocketDisconnect on receive paths, but a send on the
        # dead socket raises RuntimeError (uvloop: "handler is closed") or an OS-level error
        # depending on timing. All three just mean: this client left.
        pass
    finally:
        channel.unsubscribe(push)


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")


if __name__ == "__main__":
    main()
