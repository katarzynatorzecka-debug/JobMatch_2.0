# JobMatch

[Open the app](https://job-match-2-0.vercel.app)

**Portfolio walkthrough:** on the opening screen, select **Try JobMatch**. It opens a local sample-data flow without registration, a real CV, or a Gmail connection.

JobMatch is a portfolio project that supports a more structured job-search process. It helps turn a CV and job sources into a clear match analysis and an application-message draft.

## What it does

- builds a candidate profile from a CV or manual input,
- imports job reports from files, supported job-offer links, or a connected Gmail account,
- organises offers in a private workspace,
- runs a Hard Filter and match analysis,
- highlights strengths, risks, and data limitations,
- lets users mark offers as favourites, excluded, or applied to,
- helps draft an application message.

The analysis is a decision-support tool — it does not replace a candidate's own judgement of an offer or their CV.

## Get started

1. For a ready-to-use portfolio walkthrough, select **Try JobMatch** on the opening screen. It uses local sample data.
2. Upload a CV or complete the profile manually.
3. Choose one of three ways to import offers:
   - connect Gmail, search selected recruitment-email reports, and choose messages to import;
   - upload a saved `.eml` job report;
   - paste a supported job-offer link.
4. Review the recognised offers and start the analysis.
5. Open an offer, review the match result, and update its application status.
6. Generate an application-message draft when useful.

Gmail access is read-only and can be disconnected at any time. The current built-in Gmail search preset and report parser support RocketJobs messages; the sender, subject, and date range can be adjusted before searching.

## Run locally

Node.js is required.

```bash
npm ci
npm run dev
```

The app will be available at the address shown by Vite, usually `http://localhost:5173`.

Authenticated mode requires Supabase values in `.env.local`, based on `.env.example`. Do not commit this file.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

## Stack

React · TypeScript · Vite · Supabase · Edge Functions · Vitest
