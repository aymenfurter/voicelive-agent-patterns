"""Health check endpoints."""

from __future__ import annotations

import requests as http
from config import Config
from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "voice_endpoint_configured": bool(Config.VOICE_LIVE_API_ENDPOINT),
        "openai_endpoint_configured": bool(Config.OPENAI_ENDPOINT),
    }), 200


@health_bp.route("/api/questions/health")
def questions_health():
    try:
        resp = http.get(f"{Config.QUESTION_SERVICE_URL}/health", timeout=2)
        return jsonify(resp.json()), resp.status_code
    except http.RequestException:
        return jsonify({"status": "unreachable"}), 503
