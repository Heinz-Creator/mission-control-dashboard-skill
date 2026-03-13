---
name: mission-control-dashboard
description: "Install and run the Mission Control web dashboard for OpenClaw (projects tree + file editor + chat UI + skills picker). Use when setting up a local dashboard for OpenClaw, preparing a safe-to-share template, binding it to localhost/LAN, or troubleshooting why the dashboard can’t reach the gateway or shows empty skills."
---

# Mission Control Dashboard (OpenClaw)

This skill packages a **safe, configurable** Mission Control dashboard template that can be installed on any OpenClaw host.

## What you get

- Web UI (projects tree, editor, chat, skills picker)
- Local server that talks to the local OpenClaw gateway
- **Safety defaults**: binds to **127.0.0.1** unless explicitly changed

## Safety model (read this)

This dashboard can:
- read/write files in the configured workspace
- call gateway restart/update endpoints **if enabled**

Therefore:
- **Default bind is localhost**.
- Only expose to LAN/VPN if the user explicitly requests it.
- Never bake tokens into the template.

## Install / Run

Use the bundled PowerShell scripts:

1) Install into a folder
- Run: `scripts\\install.ps1 -TargetDir C:\\mission-control`

2) Start it
- Run: `scripts\\start.ps1 -Dir C:\\mission-control -Bind 127.0.0.1 -Port 3000`

3) Open
- `http://127.0.0.1:3000`

## Configuration knobs

- `BIND` (default `127.0.0.1`)
- `PORT` (default `3000`)
- `WORKSPACE_ROOT` (default: user’s OpenClaw workspace)
- `OPENCLAW_ENV_PATH` / `OPENCLAW_CONFIG_PATH` (optional)
- `DANGEROUS_BUTTONS=1` to enable gateway restart/update buttons (default off in this template)

## Troubleshooting quick hits

- **Skills dropdown empty**: check `/api/skills` and ensure the server can call `openclaw skills list --json`.
- **“unauthorized token missing”**: the UI is talking to gateway without token; ensure gateway token is available locally (from OpenClaw config/env).
- **Remote use**: do not bind 0.0.0.0 unless behind VPN and trusted LAN.

## References

- See `references/USAGE.md` for a user-facing guide.
