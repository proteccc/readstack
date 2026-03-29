import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// In-memory rate limiter: 10 sends per hour, keyed by both IP and Kindle email.
//
// IP extraction: we take the RIGHTMOST value from X-Forwarded-For, which is
// appended by the last trusted proxy (Railway) and cannot be forged by the
// client. Taking the leftmost value is a common mistake that allows IP spoofing.
//
// Dual-key limiting: rate limiting by IP alone can be bypassed by rotating
// IPs. Keying on the Kindle email as well means an attacker would need to
// rotate both, and each Kindle address is still hard-capped.
//
// Limitations (known, acceptable for now):
//   - Resets whenever the web process restarts.
//   - Not shared across multiple web instances.
//   - For a more robust solution, move counters into the database or Redis.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const counters = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_PER_WINDOW) return true;
  entry.count++;
  return false;
}

// Extract the real client IP from X-Forwarded-For.
// Takes the rightmost entry (appended by Railway's proxy) to prevent spoofing.
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
  return ips[ips.length - 1] ?? "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: "Too many requests. Try again in an hour." },
      { status: 429 }
    );
  }

  let body: { url?: string; kindleEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const url = body.url?.trim();
  const kindleEmail = body.kindleEmail?.trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, message: "A valid http(s) URL is required." },
      { status: 400 }
    );
  }

  if (!kindleEmail || !/^[^\s@]+@kindle\.com$/i.test(kindleEmail)) {
    return NextResponse.json(
      { ok: false, message: "A valid @kindle.com email address is required." },
      { status: 400 }
    );
  }

  // Secondary rate limit keyed on Kindle email — caps abuse even if IP is rotated.
  if (isRateLimited(`email:${kindleEmail.toLowerCase()}`)) {
    return NextResponse.json(
      { ok: false, message: "Too many requests. Try again in an hour." },
      { status: 429 }
    );
  }

  const job = await db.job.create({
    data: {
      sourceUrl: url,
      status: "queued",
      guestKindleEmail: kindleEmail,
    },
  });

  return NextResponse.json({ ok: true, jobId: job.id }, { status: 201 });
}
