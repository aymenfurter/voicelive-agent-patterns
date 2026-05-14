#!/usr/bin/env bash
# port-forward: request port forwarding from container to host
# Writes request files to the workspace; the host-side watcher picks them up.
set -euo pipefail

# Find workspace root (where .devcontainer lives)
find_workspace() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.devcontainer" ]]; then
            echo "$dir"
            return
        fi
        dir="$(dirname "$dir")"
    done
    echo "$PWD"
}

WORKSPACE="$(find_workspace)"
PF_DIR="$WORKSPACE/.devcontainer/.port-forwards"
mkdir -p "$PF_DIR"

usage() {
    echo "Usage: port-forward <command> [args]"
    echo ""
    echo "Commands:"
    echo "  add <port>      Request port forwarding to host"
    echo "  remove <port>   Stop forwarding a port"
    echo "  remove-all      Stop all port forwards"
    echo "  list            List forwarded ports"
}

validate_port() {
    local port="$1"
    if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 ]] || [[ "$port" -gt 65535 ]]; then
        echo "Error: invalid port number '$port' (must be 1-65535)"
        exit 1
    fi
}

do_add() {
    local port="$1"
    echo "$port" > "$PF_DIR/$port.request"
    echo "✓ Port $port forwarding requested"
    echo "  The host will pick this up automatically."
    echo "  Access from host: http://localhost:$port"
    
    # Wait briefly for host watcher to pick it up
    sleep 2
    if [[ -f "$PF_DIR/$port.active" ]]; then
        echo "✓ Port $port is now forwarded and accessible on the host"
    fi
}

do_remove() {
    local port="$1"
    rm -f "$PF_DIR/$port.request" "$PF_DIR/$port.active"
    echo "stop" > "$PF_DIR/$port.stop"
    echo "✓ Port $port forward removal requested"
}

do_remove_all() {
    rm -f "$PF_DIR"/*.request "$PF_DIR"/*.active
    echo "stop-all" > "$PF_DIR/.stop-all"
    echo "✓ All port forwards removal requested"
}

do_list() {
    local found=false
    shopt -s nullglob
    for f in "$PF_DIR"/*.request "$PF_DIR"/*.active; do
        local port
        port=$(basename "$f" | sed 's/\.\(request\|active\)//')
        local status="pending"
        [[ -f "$PF_DIR/$port.active" ]] && status="active"
        echo "  → port $port ($status)"
        found=true
    done
    if ! $found; then
        echo "  No port forwards"
    fi
}

case "${1:-}" in
    add)
        [[ -n "${2:-}" ]] || { echo "Error: port number required"; exit 1; }
        validate_port "$2"
        do_add "$2"
        ;;
    remove)
        [[ -n "${2:-}" ]] || { echo "Error: port number required"; exit 1; }
        validate_port "$2"
        do_remove "$2"
        ;;
    remove-all)
        do_remove_all
        ;;
    list)
        do_list
        ;;
    *)
        usage
        exit 1
        ;;
esac
