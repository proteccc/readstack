import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  let body: { url?: string } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const url = body.url?.trim();

  if (!url) {
    return NextResponse.json(
      { ok: false, message: "Missing article URL." },
      { status: 400 }
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, message: "URL must start with http:// or https://." },
      { status: 400 }
    );
  }

  try {
    const job = await db.job.create({
      data: {
        userId: user.id,
        sourceUrl: url,
        normalizedUrl: null,
        status: "queued",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        jobId: job.id,
        status: job.status,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Failed to create job.",
      },
      { status: 500 }
    );
  }
}

