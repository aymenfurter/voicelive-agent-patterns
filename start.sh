#!/usr/bin/env bash
set -e

cleanup() {
    echo "Shutting down..."
    if [ -n "$QS_PID" ]; then
        kill "$QS_PID" 2>/dev/null || true
        wait "$QS_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start question-service in background
cd /app/question-service
gunicorn app:app --bind 0.0.0.0:8001 --workers 2 --timeout 120 &
QS_PID=$!

# Start backend in foreground
cd /app/backend
exec gunicorn app:app --bind 0.0.0.0:8000 --workers 2 --timeout 120 --worker-class gthread --threads 4
