# Railway Deployment Guide

## Overview

Deploy two services from this repo into the same Railway project:

| Service | Start command | Purpose |
|---|---|---|
| **web** | `npm start` (after `npm run build`) | Next.js web app |
| **worker** | `npm run start:worker` | Job polling and EPUB delivery |

Both services share the same repo and the same environment variables.

---

## Setup Steps

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your fork of this repo
4. Railway will auto-detect the Next.js app and create a first service

### 2. Configure the web service

In the Railway dashboard for the first (web) service:
- **Build command**: `npm install && npm run build`
- **Start command**: `npm start`
- **Root directory**: `/` (repo root)

### 3. Add the worker service

1. In your Railway project, click **New Service → GitHub Repo**
2. Select the same repo
3. Set:
   - **Build command**: `npm install && cd worker && npm install`
   - **Start command**: `npm run start:worker`
   - **Root directory**: `/` (repo root)

### 4. Set environment variables

Set these on **both** services in Railway's Variables tab. See `.env.example`
for full descriptions of each variable.

```
# Supabase (https://supabase.com → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Supabase → Project Settings → Database → Connection string)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# Resend (https://resend.com → API Keys)
RESEND_API_KEY=re_...
READSTACK_FROM_EMAIL=readstack@yourdomain.com
NEXT_PUBLIC_READSTACK_FROM_EMAIL=readstack@yourdomain.com

# Worker
EPUB_GENERATOR=node
POLL_INTERVAL_MS=5000
```

### 5. Enable Row Level Security

In your Supabase project, go to the **SQL Editor** and run the contents of
[`prisma/enable-rls.sql`](prisma/enable-rls.sql). This prevents direct access
to your data via Supabase's public REST API. Your app is unaffected.

### 6. Set the public domain

In the web service settings, generate a Railway domain (e.g.
`readstack-production.up.railway.app`) or attach a custom domain.

### 7. Update Supabase auth callback URL

In your Supabase dashboard under **Authentication → URL Configuration**:
- Add your Railway domain to **Redirect URLs**:
  `https://your-domain.up.railway.app/auth/callback`

---

## Reverting to Calibre

If needed, set `EPUB_GENERATOR=calibre` on the worker service and redeploy.
Note: Calibre is not installed in the default Railway environment — this path
is intended for local use only. The Node path is the default production path.
