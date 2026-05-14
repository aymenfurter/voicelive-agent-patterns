"""TTL-bounded in-memory session store.

Provides a dict-like interface with automatic eviction of expired entries,
preventing unbounded memory growth in long-running processes.
"""

from __future__ import annotations

import threading
import time
from typing import Any


class SessionStore:
    """Thread-safe dictionary with TTL-based eviction and a max size cap."""

    def __init__(self, maxsize: int = 256, ttl: int = 3600) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        self._store: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def _is_expired(self, timestamp: float) -> bool:
        return (time.time() - timestamp) > self._ttl

    def _evict_expired(self) -> None:
        """Remove all expired entries (must hold lock)."""
        expired_keys = [k for k, (ts, _) in self._store.items() if self._is_expired(ts)]
        for k in expired_keys:
            del self._store[k]

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            ts, value = entry
            if self._is_expired(ts):
                del self._store[key]
                return None
            return value

    def put(self, key: str, value: dict[str, Any]) -> None:
        with self._lock:
            self._evict_expired()
            # Evict oldest if at capacity
            while len(self._store) >= self._maxsize:
                oldest_key = min(self._store, key=lambda k: self._store[k][0])
                del self._store[oldest_key]
            self._store[key] = (time.time(), value)

    def pop(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._store.pop(key, None)
            if entry is None:
                return None
            ts, value = entry
            if self._is_expired(ts):
                return None
            return value

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None
