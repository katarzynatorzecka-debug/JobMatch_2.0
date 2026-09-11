# AGENTS.md — JOBMATCH

## Purpose

This file defines how coding and planning agents must work in the JobMatch repository.

It is onboarding for agents, not a README for humans.

## Project

```text
Name: JobMatch
Program: AIDEAS Vibe Coding
Current stage: WORKSPACE-FIRST PRODUCT RECOVERY
Active product checkpoint: R1.1 — Workspace contracts i schema foundation
```

## Operating model

```text
PMO
→ Development 3.0
→ Codex
→ Development Review
→ PMO
```

- Development 3.0 does not implement code.
- Codex is the only coding executor.
- PMO owns scope and approval.
- The user owns final decisions and commit authorization.

## Git safety

Never execute without explicit user approval:

```text
git add
git commit
git push
git reset
git restore
git clean
git rebase
history rewriting
```

Allowed without approval:

```text
git status
git diff
git log
git check-ignore
```

Always inspect the working tree before implementation.

## Secrets

Never commit or print:

- `.env`
- `.env.local`
- API keys
- Supabase service role keys
- database passwords
- user JWTs
- OpenAI keys
- private CVs
- raw private `.eml`
- files from `private-data/`

Frontend may use only the Supabase publishable key.

Server secrets belong in Supabase secrets or another server-side secret store.

## Private files

Expected ignored paths:

```text
private-data/
.env
.env.*
!.env.example
```

Before using a private file:

```text
git check-ignore <path>
```

## Sources of truth

Read in this order:

1. latest explicit user decision,
2. latest PMO approved decision,
3. active R1 Technical Plan,
4. active R1 Development Handoff,
5. Updated Product Direction,
6. Recovery Plan,
7. current `PROJECT_STATE.md`,
8. `DECISIONS.md`,
9. `ROADMAP.md`,
10. `BACKLOG.md`,
11. historical Brief, PRD, UX Skeleton and Development Start Contract,
12. `LESSONS.md`.

Do not treat model memory as authoritative.

## Current freeze

`AUDITafterCheckpoint07` is complete. The approved direction is
`WORKSPACE-FIRST PRODUCT RECOVERY`.

Only the explicitly approved substage may be implemented. R1.1 ends with a hard
STOP for Development Review, PMO Review and a new user decision; Codex must not
advance automatically to R1.2 or any later substage.

## Frozen visual assets

```text
frontend(1).png
logo(1).png
```

Do not regenerate, reinterpret or replace them without explicit approval.

## Validation commands

Windows:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Do not run:

```text
npm audit fix --force
```

## Reporting

Every implementation checkpoint report must include:

- Git state on entry,
- changed files,
- scope completed,
- tests,
- typecheck,
- build,
- manual verification,
- blockers,
- known limitations,
- proposed commit scope,
- proposed commit message,
- explicit request for commit approval.

## Audit mode

When instructed to audit:

- do not change functional code,
- do not fix defects silently,
- distinguish WORKING / PARTIAL / STATIC / BROKEN / NOT CONNECTED,
- report what exists, not what prompts intended,
- do not perform a commit.
