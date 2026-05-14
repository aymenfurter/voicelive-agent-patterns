"""Flask application factory for the Voice Agent Backend."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from api import health_bp, patterns_bp, sessions_bp, sessions_bp_alias
from api.patterns import AVAILABLE_PATTERNS  # noqa: F401 — back-compat re-export
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sock import Sock
from session_store import SessionStore
from websocket_handler import handle_websocket

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_app(session_store: SessionStore | None = None) -> Flask:
    """Build and wire the Flask app. Accepts an injected SessionStore for tests."""
    app = Flask(__name__, static_folder=None)
    CORS(app)
    sock = Sock(app)

    app.config["SESSION_STORE"] = session_store or SessionStore(maxsize=256, ttl=3600)

    app.register_blueprint(health_bp)
    app.register_blueprint(patterns_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(sessions_bp_alias)

    _register_websocket(app, sock)
    _register_static(app)
    return app


def _register_websocket(app: Flask, sock: Sock) -> None:
    @sock.route("/ws")
    def ws_endpoint(ws: Any) -> None:
        store = app.config["SESSION_STORE"]
        session_id = request.args.get("session_id")
        pattern = request.args.get("pattern")
        session_config = None
        session = store.get(session_id) if session_id else None
        if not pattern and session:
            pattern = session.get("pattern", "chat-supervisor")
            session_config = session.get("config")
        pattern = pattern or "chat-supervisor"

        if session:
            session["status"] = "connected"

        logger.info("WebSocket connected (pattern: %s, session: %s)", pattern, session_id)
        try:
            handle_websocket(ws, pattern_name=pattern, session_config=session_config)
        finally:
            session = store.get(session_id) if session_id else None
            if session:
                session["status"] = "disconnected"
            logger.info("WebSocket disconnected (session: %s)", session_id)


def _register_static(app: Flask) -> None:
    @app.route("/")
    def serve_index() -> Any:
        if FRONTEND_DIR.exists():
            return send_from_directory(str(FRONTEND_DIR), "index.html")
        return jsonify({"message": "Frontend not built. Run the frontend build first."}), 404

    @app.route("/<path:path>")
    def serve_static(path: str) -> Any:
        if FRONTEND_DIR.exists() and (FRONTEND_DIR / path).exists():
            return send_from_directory(str(FRONTEND_DIR), path)
        return jsonify({"error": "Not found"}), 404


# Module-level WSGI app for gunicorn / `app:app`.
app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    logger.info("Starting Voice Agent Backend on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "0") == "1")
