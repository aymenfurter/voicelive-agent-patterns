"""Shared asyncio event loop running in a single native OS thread.

Gunicorn + gevent workers cannot host asyncio directly, so we run one
background loop and schedule per-session coroutines onto it.
"""

from __future__ import annotations

import asyncio
import threading

_shared_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def _native_thread_class() -> type[threading.Thread]:
    try:
        import gevent.monkey  # type: ignore
        return gevent.monkey.get_original("threading", "Thread")
    except (ImportError, AttributeError):
        return threading.Thread


def get_shared_loop() -> asyncio.AbstractEventLoop:
    """Return the shared event loop, starting it on first call."""
    global _shared_loop
    if _shared_loop is not None and _shared_loop.is_running():
        return _shared_loop

    with _loop_lock:
        if _shared_loop is not None and _shared_loop.is_running():
            return _shared_loop

        ready = threading.Event()

        def _run_loop() -> None:
            global _shared_loop
            _shared_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_shared_loop)
            ready.set()
            _shared_loop.run_forever()

        thread_cls = _native_thread_class()
        thread_cls(target=_run_loop, daemon=True).start()
        ready.wait(timeout=5)
        assert _shared_loop is not None
        return _shared_loop
