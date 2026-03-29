import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    select: { userId: true, status: true, failureReason: true },
  });

  if (!job) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Ownership check:
  //   - Authenticated user: job must belong to them.
  //   - Unauthenticated caller: only guest jobs (no userId) are accessible.
  const user = await getCurrentUser();
  if (job.userId !== null && job.userId !== user?.id) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: job.status, failureReason: job.failureReason });
}
