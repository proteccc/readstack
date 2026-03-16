import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    select: { status: true, failureReason: true },
  });

  if (!job) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: job.status, failureReason: job.failureReason });
}
