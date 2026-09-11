# DECISIONS.md — JOBMATCH

Append-only decision log.

## D-001 — Six-screen core flow

Status: APPROVED

```text
Start
Profil
Import i analiza
Lista ofert
Szczegóły oferty
Generator wiadomości
```

Access Gate is a pre-app layer.

## D-002 — Manual analysis trigger

Status: APPROVED

After `.eml` import:

```text
validation
→ parser
→ recognized offers summary
→ user clicks Analizuj oferty
```

Analysis does not start automatically.

## D-003 — Missing information

Status: APPROVED

```text
missing information ≠ FAIL
```

Uncertain offers remain visible and receive a review-required state.

## D-004 — Development operating model

Status: APPROVED

```text
PMO → Development 2.0 → Codex → Development Review → PMO
```

Codex is the only implementation executor.

## D-005 — Git commits

Status: APPROVED

No commit, staging, push or history changes without explicit user approval.

## D-006 — CV Import Lite

Status: APPROVED

- PDF text extraction,
- deterministic draft,
- user review,
- manual fallback,
- no universal CV parser.

## D-007 — Supabase

Status: APPROVED

Use for:

- Auth,
- profile persistence,
- import sessions,
- normalized offers,
- analyses.

Demo mode remains local.

## D-008 — AI analysis

Status: APPROVED FOR PROTOTYPE

- server-side Edge Function,
- no API key in frontend,
- structured `JobAnalysis`,
- Hard Filter remains independent.

## D-009 — Visual assets

Status: FROZEN

```text
frontend(1).png
logo(1).png
```

## D-010 — Product pause after CP7

Status: ACTIVE

No further feature checkpoint before:

```text
AUDITafterCheckpoint07
```

Reason:

The current version is not accepted as sufficiently useful or aligned with the JobMatch vision.

## D-011 — Workspace-First Product Recovery

Status: APPROVED

Supersedes operationally: D-010

`AUDITafterCheckpoint07` is complete. The active direction is
`WORKSPACE-FIRST PRODUCT RECOVERY`: authenticated workspaces use Supabase as the
source of truth, imports feed a shared offer pool, and history is durable.

Execution is staged. R1.1 is the only currently approved implementation substage;
Codex must stop for Development Review and a new PMO/user decision before R1.2.
