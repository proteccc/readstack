# Railway Deployment Guide

## Overview

Deploy two services from this repo:

| Service | Start command | Purpose |
|---|---|---|
| **web** | `npm start` (after `npm run build`) | Next.js web app |
| **worker** | `npm run start:worker` | Job polling and EPUB delivery |

Both services use the same repo root. Railway will run `nixpacks.toml` to
install Node.js 20 and JDK 17 (required by the Java HTML-extraction pipeline).

---

## Setup Steps

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select `proteccc/readstack`
4. Railway will auto-detect the Next.js app and create a first service

### 2. Configure the web service

In the Railway dashboard for the first (web) service:
- **Build command**: `npm install && npm run build`
- **Start command**: `npm start`
- **Root directory**: `/` (repo root)

### 3. Add the worker service

1. In your Railway project, click **New Service → GitHub Repo**
2. Select the same `proteccc/readstack` repo
3. Set:
   - **Build command**: `npm install && cd worker && npm install`
   - **Start command**: `npm run start:worker`
   - **Root directory**: `/` (repo root)

### 4. Set environment variables

Set these on **both** services in Railway's Variables tab:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://izbtcpbgesgwwutxybax.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
DATABASE_URL=<your supabase postgres connection string>

# SMTP
READSTACK_SMTP_EMAIL=readstack1@gmail.com
READSTACK_SMTP_PASSWORD=<your gmail app password>

# Worker
EPUB_GENERATOR=node
POLL_INTERVAL_MS=5000
```

The `NEXT_PUBLIC_*` vars are only used by the web service but setting them
on both is harmless.

### 5. Set the public domain

In the web service settings, generate a Railway domain (e.g.
`readstack-production.up.railway.app`) or attach a custom domain.

### 6. Update Supabase auth callback URL

In your Supabase dashboard under Authentication → URL Configuration:
- Add your Railway domain to **Redirect URLs**:
  `https://your-domain.up.railway.app/auth/callback`

---

## Reverting to Calibre

If the Node EPUB path has issues, set `EPUB_GENERATOR=calibre` on the worker
service and redeploy. Note: Calibre is not installed in the Railway environment,
so this will fail unless you add a custom Dockerfile with Calibre. The Node
path is the intended production path.
