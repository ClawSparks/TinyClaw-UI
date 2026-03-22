# Script Inventory

This folder contains maintenance and release scripts used by TinyClaw Control Center.

## Validation and gates

- `validate-task-store.ts`
- `validate-budget-compute.ts`
- `goal-gate.ts`
- `dod-check.ts`
- `evidence-gate.ts`

## Runtime and recovery

- `health-snapshot.ts`
- `periodic-snapshot.ts`
- `run-lock.ts`
- `stall-auto-heal.ts`
- `watchdog-orchestrator.ts`
- `resident-worker.ts`
- `resident-supervisor.ts`
- `evidence-reporter.ts`

## Release and smoke checks

- `ui-smoke.sh`
- `release-audit.sh`
- `run_verifier.sh`

## Utility

- `export-staff-avatars.ts`
- `mc_dod_evaluator.py`
- `mc_rollback_plan.py`
