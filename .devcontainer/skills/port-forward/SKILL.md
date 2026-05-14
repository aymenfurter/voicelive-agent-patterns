---
name: port-forward
description: "Forward ports from the devcontainer to the host machine dynamically. Use when the user asks to access a port, open a URL, preview a web app, expose a service, or says anything like 'let me access port X', 'forward port', 'open localhost', 'I want to see the app'. Also use proactively when starting a dev server."
---

# Port Forwarding in Sandboxed Copilot

You are running inside a devcontainer on macOS. Ports are NOT automatically accessible from the host. You MUST use the `port-forward` tool to expose them.

## Commands

```bash
port-forward add <port>       # Expose a container port to the host
port-forward remove <port>    # Stop forwarding
port-forward remove-all       # Stop all forwards
port-forward list             # Show active forwards
```

## Workflow

1. **When starting a dev server**, always bind to `0.0.0.0` and forward the port:
   ```bash
   npm run dev -- --host 0.0.0.0 --port 5173 &
   port-forward add 5173
   ```
   Tell the user: "Access at http://localhost:5173"

2. **When the user asks to access a port:**
   ```bash
   port-forward add 8000
   ```

3. **Clean up when done:**
   ```bash
   port-forward remove-all
   ```

## Important
- Services MUST bind to `0.0.0.0` (not `127.0.0.1`) for forwarding to work
- Always call `port-forward add` BEFORE telling the user a URL is accessible
- The forwarding is handled by a host-side watcher via socat tunnels
