import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// In-memory IP rate limiter: 10 sends per hour per IP.
// Resets on worker restart — acceptable for MVP.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const ipCounters = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounters.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounters.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_PER_WINDOW) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

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

  const job = await db.job.create({
    data: {
      sourceUrl: url,
      status: "queued",
      guestKindleEmail: kindleEmail,
    },
  });

  return NextResponse.json({ ok: true, jobId: job.id }, { status: 201 });
}
