# TinyClaw Control Center Project Structure

This document defines the intended repository layout for public release and ongoing maintenance.

## Top-level layout

- `src/`: application source code
- `scripts/`: operational and validation scripts
- `test/`: unit and smoke-oriented tests
- `docs/`: architecture, runbooks, publishing notes, and setup prompts
- `img/`: static branding assets used by the UI shell

## Source modules (`src/`)

- `index.ts`: process entrypoint for monitor mode, UI mode, and command mode
- `config.ts`: environment parsing and safety gate configuration
- `ui/server.ts`: HTTP UI server, API routes, and chat-gateway proxy layer
- `runtime/`: domain services and data pipelines (tasks, sessions, costs, docs, memory, approvals)
- `clients/`: upstream tool/gateway clients
- `adapters/`: normalized adapters over client capabilities
- `contracts/`: tool and response contract types
- `mappers/`: payload normalization and status mapping utilities

## Documentation layout (`docs/`)

- `ARCHITECTURE.md`: system architecture and boundaries
- `RUNBOOK.md`: runtime operations and incident handling
- `PUBLISHING.md`: release and publishing checklist
- `PROJECT_STRUCTURE.md`: repository structure conventions
- `setup/INSTALL_PROMPT*.md`: copy-ready onboarding prompts for OpenClaw-assisted installation
- `assets/`: README screenshots and visual assets

## Script conventions (`scripts/`)

- Scripts are designed to be executable independently through `npm run ...`.
- New scripts should keep side effects explicit and default to safe behavior.
- Script filenames should reflect intent (`validate-*`, `*-snapshot`, `*-gate`, `*-orchestrator`).

## Release hygiene rules

- Keep temporary files out of the repository root.
- Keep user-facing onboarding docs inside `docs/setup/`.
- Keep runtime-generated files under `runtime/` and out of source directories.
