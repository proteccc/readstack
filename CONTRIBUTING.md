# Contributing

Thanks for your interest in contributing to Readstack.

## Before you start

Please open an issue before starting significant work. This avoids situations where you spend time on something that's already in progress or doesn't align with the project direction.

For small fixes (typos, obvious bugs), a PR without a prior issue is fine.

## Running locally

See the [README](README.md) for prerequisites and setup steps.

Once set up, run both processes in separate terminals:

```bash
# Terminal 1 — web app
npm run dev

# Terminal 2 — worker
cd worker && npm run dev
```

## Project structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full breakdown of the codebase.

## Making changes

- Keep PRs focused. One concern per PR.
- The worker and frontend share error codes — if you change `worker/error-codes.ts`, update `lib/error-codes.ts` to match (and vice versa).
- The `EPUB_GENERATOR=node` path is the active production path. The `calibre` path is a local-only fallback — avoid breaking it but don't optimize for it.
- The worker is intentionally simple (a poll loop, not a queue library). Keep it that way unless there's a compelling reason to change.

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test locally (submit a real URL and verify delivery)
4. Open a PR with a clear description of what changed and why
