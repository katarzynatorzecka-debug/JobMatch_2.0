# JobMatch Gmail G2.2 — Parser correction checkpoint report

**Status:** IMPLEMENTATION PASS — HUMAN REVIEW REQUIRED  
**Scope:** Correct false offer extraction from a newsletter header without changing Gmail OAuth, database schema, or stored Gmail data.

## Git state on entry

- Repository: `C:\Users\katar\OneDrive\Desktop\AIDEAS VC\NewJobCopilot\JobMatch_2.0`
- Branch: `feat/cv-parser-v2`, six commits ahead of `origin/feat/cv-parser-v2`
- HEAD: `16630f4 feat: add Gmail search and report import`
- Pre-existing unrelated untracked files: `Wideo — skrót .lnk`, `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md`

## Scope completed

- An unlabelled RocketJobs block is accepted only when it contains a compact offer-card structure: at least two useful card lines followed by a status/time line (`Pozostało`, `Pozostalo`, `Dodano`, `Wygasa`, or `Opublikowano`).
- A block with explicitly labelled company and title remains accepted.
- The same rule is applied by the local `.eml` parser and the server-side Gmail parser.
- A synthetic regression fixture confirms that a newsletter header containing a RocketJobs link is ignored while the following valid offer is retained.

## Changed files

- `src/features/import/rocketJobsReportParser.ts`
- `src/features/import/rocketJobsReportParser.test.ts`
- `supabase/functions/_shared/gmail/reportParser.ts`
- `supabase/functions/_shared/gmail/reportParser.test.ts`
- `docs/checkpoints/JobMatch_Gmail_G2_2_Parser_Correction_Checkpoint_Report.md`

## Validation

- Targeted parser tests: PASS — 2 files, 10 tests.
- Full test suite: PASS — 99 files, 494 tests.
- Typecheck: PASS — `npm.cmd run typecheck`.
- Production build: PASS — `npm.cmd run build`.
- Diff check: PASS. Git reports only existing LF-to-CRLF conversion notices.

## Manual verification

Not run. Re-importing a live Gmail report would create a new staged import and modify the active workspace session. The regression is covered by synthetic frontend and server parser tests; no AI analysis was triggered and no Gmail message content was stored in this report.

## Blockers and known limitations

- The structural rule is deliberately conservative and should be calibrated if RocketJobs introduces a materially different card layout.
- Gmail account switching remains outside this correction and requires the separately scoped multi-account design, migration, API, and UI work.
- The production Edge Function has not been redeployed by this checkpoint.

## Proposed commit scope

Only the five files listed in **Changed files**. Exclude the two pre-existing unrelated untracked files.

## Proposed commit message

`fix: reject Gmail newsletter header pseudo-offers`

## Approval required

Explicit approval is required before `git add` and `git commit`.
