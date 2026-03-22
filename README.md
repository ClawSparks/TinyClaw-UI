# TinyClaw-UI Workspace

This workspace is the cleaned local source tree for TinyClaw.

## Structure

- `apps/tinyclaw-chat-gateway`
  - Chat gateway backend and web frontend
- `apps/tinyclaw-control-center`
  - TinyClaw Control Center UI and runtime tooling
- `deploy/v1`
  - One-click deployment packaging scripts and templates

## Local build checklist

Build in this order:

1. `apps/tinyclaw-chat-gateway/backend`
2. `apps/tinyclaw-chat-gateway/frontend`
3. `apps/tinyclaw-control-center`

Each module keeps its own `package.json` and lockfile.
