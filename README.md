# Readstack

Send Substack articles to your Kindle — paste a URL, get an EPUB in your inbox.

**Live at [read-stack.com](https://www.read-stack.com)**

---

## What it does

Readstack takes a Substack article URL, converts it to a clean EPUB, and delivers it to your Kindle via email. No clutter, no browser, no paywalls — just the article in your reading queue.

## Stack

- **Frontend/API** — Next.js (App Router) + TypeScript
- **Auth** — Supabase (magic link, PKCE)
- **Database** — PostgreSQL via Prisma
- **Worker** — Node.js process polling a job queue
- **EPUB generation** — Readability.js + epub-gen-memory
- **Email delivery** — Resend
- **Hosting** — Railway

## Project structure

```
app/          # Next.js pages and API routes
worker/       # Background job runner (fetch → convert → send)
lib/          # Shared utilities (auth, Supabase client)
prisma/       # Database schema and migrations
```

## Running locally

### Prerequisites

- Node.js 18+
- A Supabase project
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

See `.env.example` for all required variables:

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for email delivery |
| `READSTACK_FROM_EMAIL` | Verified sending address (e.g. `readstack@yourdomain.com`) |
| `READSTACK_RECIPIENT_EMAILS` | Your email + Kindle email (local dev only) |
| `EPUB_GENERATOR` | `node` (default) or `calibre` |

Supabase keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are also required — copy them from your Supabase project settings.

### Running

```bash
# Start the Next.js app
npm run dev

# In a separate terminal, start the worker
cd worker && npm run dev
```

## Deployment

The app and worker are deployed as two separate Railway services from the same repo, pointing at a shared PostgreSQL instance.

## Contributing

PRs and issues welcome. Please open an issue before starting significant work so we can discuss the approach.

## License

MIT
