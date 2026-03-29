# Readstack

Paste an article URL, get an EPUB on your Kindle.

**Live at [read-stack.com](https://www.read-stack.com)**

---

## What it does

Readstack takes any long-form article URL, converts it to a clean EPUB, and delivers it to your Kindle via email. No clutter, no browser, no syncing — just the article in your reading queue.

## Stack

- **Frontend/API** — Next.js (App Router) + TypeScript
- **Auth** — Supabase (magic link / OTP)
- **Database** — PostgreSQL via Prisma
- **Worker** — Node.js background process polling a job queue
- **EPUB generation** — Readability.js + epub-gen-memory
- **Email delivery** — Resend
- **Hosting** — Railway

## Project structure

```
app/          # Next.js pages and API routes
worker/       # Background job runner (fetch → convert → send)
lib/          # Shared utilities (auth, Supabase client, error codes)
prisma/       # Database schema and migrations
```

For a detailed breakdown of the data flow and architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Running locally

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A Resend account with a verified sending domain

### Setup

```bash
git clone https://github.com/proteccc/readstack.git
cd readstack
npm install
cd worker && npm install && cd ..
cp .env.example .env
# Fill in your credentials in .env
npx prisma migrate dev
```

### Environment variables

Copy `.env.example` to `.env` and fill in all values. Key variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `DATABASE_URL` | Postgres connection string (transaction pooler) |
| `DIRECT_URL` | Postgres direct connection string (for migrations) |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `READSTACK_FROM_EMAIL` | Verified sending address |
| `NEXT_PUBLIC_READSTACK_FROM_EMAIL` | Same address, shown in the UI |
| `READSTACK_RECIPIENT_EMAILS` | Your email + Kindle email (local dev only) |
| `EPUB_GENERATOR` | `node` (default) or `calibre` |
| `POLL_INTERVAL_MS` | Worker poll interval in ms (default: `5000`) |

### Running

```bash
# Terminal 1 — web app
npm run dev

# Terminal 2 — worker
cd worker && npm run dev
```

## Deployment

The app and worker run as two separate Railway services pointing at a shared Supabase PostgreSQL instance. See [RAILWAY.md](RAILWAY.md) for the full step-by-step deployment guide.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Built by

[@gabewise](https://x.com/gabewise)

## License

MIT
