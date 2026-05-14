"""Session lifecycle REST endpoints.

The same routes are exposed under both `/api/session/...` (legacy/test alias)
and `/api/sessions/...` (canonical, used by the frontend).
"""

from __future__ import annotations

import logging
import uuid

from flask import Blueprint, current_app, jsonify, request

from .patterns import PATTERN_IDS

logger = logging.getLogger(__name__)


def _make_blueprint(name: str, prefix: str) -> Blueprint:
    bp = Blueprint(name, __name__, url_prefix=prefix)

    @bp.route("", methods=["POST"])
    def create_session():
        data = request.get_json(silent=True) or {}
        pattern = data.get("pattern", "chat-supervisor")
        config = data.get("config")
        if pattern not in PATTERN_IDS:
            return jsonify({"error": f"Unknown pattern: {pattern}"}), 400

        session_id = str(uuid.uuid4())
        current_app.config["SESSION_STORE"].put(session_id, {
            "id": session_id,
            "pattern": pattern,
            "config": config,
            "status": "created",
            "events": [],
        })
        logger.info("Session created: %s (pattern: %s)", session_id, pattern)
        return jsonify({
            "session_id": session_id, "pattern": pattern, "status": "created",
        }), 201

    @bp.route("/<session_id>/status")
    def get_session_status(session_id: str):
        session = current_app.config["SESSION_STORE"].get(session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        return jsonify({
            "id": session["id"],
            "pattern": session["pattern"],
            "status": session["status"],
            "event_count": len(session["events"]),
        }), 200

    @bp.route("/<session_id>", methods=["DELETE"])
    def delete_session(session_id: str):
        session = current_app.config["SESSION_STORE"].pop(session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        logger.info("Session deleted: %s", session_id)
        return jsonify({"status": "deleted"}), 200

    return bp


sessions_bp = _make_blueprint("sessions", "/api/sessions")
sessions_bp_alias = _make_blueprint("sessions_alias", "/api/session")
