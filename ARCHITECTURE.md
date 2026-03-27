# Architecture

Readstack is a two-process application: a Next.js web app and a Node.js background worker. They communicate through a shared PostgreSQL database (via Prisma).

```
Browser
  │
  │  HTTP
  ▼
Next.js app (web service)
  │  - Serves UI
  │  - Handles auth (Supabase)
  │  - Creates job records in DB
  │  - Polls job status for the frontend
  │
  │  PostgreSQL (Supabase)
  │
  ▼
Worker (worker service)
  │  - Polls DB for queued jobs every 5s
  │  - Fetches article HTML (Readability.js)
  │  - Converts to EPUB (epub-gen-memory)
  │  - Delivers via email (Resend)
  │  - Updates job status in DB
  │
  ▼
Kindle inbox
```

---

## Key files

### Web app (`app/`)

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout, nav, GA analytics |
| `app/page.tsx` | Home page — renders SendForm |
| `app/SendForm.tsx` | Main send flow (URL input, setup steps, job polling) |
| `app/api/jobs/route.ts` | Create job (authenticated users) |
| `app/api/jobs/guest/route.ts` | Create job (unauthenticated, with rate limiting) |
| `app/api/jobs/[id]/route.ts` | Poll job status |
| `app/settings/SettingsClient.tsx` | Account / Kindle email settings |
| `app/history/page.tsx` | Send history |

### Worker (`worker/`)

| File | Purpose |
|---|---|
| `worker/index.ts` | Poll loop, startup recovery, SIGTERM handler |
| `worker/run-job.ts` | Claim and execute a single job |
| `worker/fetch-article.ts` | Fetch URL → extract article HTML via Readability.js |
| `worker/epub/node.ts` | Convert HTML → EPUB → send via Resend |
| `worker/error-codes.ts` | Canonical error code constants |

### Shared

| File | Purpose |
|---|---|
| `lib/error-codes.ts` | Same error codes as `worker/error-codes.ts` — used by the frontend |
| `lib/db.ts` | Prisma client singleton |
| `lib/auth.ts` | `getCurrentUser()` helper |
| `lib/supabase/` | Supabase client setup (browser + server) |
| `prisma/schema.prisma` | Database schema |
| `middleware.ts` | Supabase session refresh on every request |

---

## Data flow

### Authenticated send

1. User submits a URL on the home page
2. `POST /api/jobs` creates a `Job` record (`status: "queued"`)
3. Job ID is stored in sessionStorage; frontend polls `GET /api/jobs/:id` every 2s
4. Worker picks up the job, sets `status: "running"`
5. Worker fetches → converts → delivers; sets `status: "completed"` or `"failed"` with a `failureReason`
6. Frontend detects terminal status and renders success or error UI

### Guest send

Same flow, but via `POST /api/jobs/guest`. No account required — the Kindle email is supplied directly in the request and stored on the job record. An in-memory IP rate limiter (10/hour) prevents abuse.

---

## Job states

```
queued → running → completed
                 ↘ failed
```

Jobs stuck in `running` for more than 10 minutes are automatically reset to `failed` when the worker starts (orphan recovery).

---

## Auth

Authentication is handled entirely by Supabase (magic link / OTP flow). The Next.js middleware refreshes the session cookie on every request. The Supabase service role key is used server-side only (API routes) to query user data without going through row-level security.

---

## EPUB generation

Two paths exist, controlled by the `EPUB_GENERATOR` environment variable:

- **`node`** (default) — `worker/fetch-article.ts` fetches the URL and extracts the article using Readability.js (the same library as Firefox Reader Mode). `worker/epub/node.ts` converts the extracted HTML to EPUB using `epub-gen-memory` and sends it via Resend.
- **`calibre`** — The original Java pipeline. Requires Calibre to be installed. Kept as a fallback for local use only.
