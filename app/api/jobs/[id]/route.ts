import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  const { id } = await params;

  const job = await db.job.findFirst({
    where: { id, userId: user.id },
    select: { status: true, failureReason: true },
  });

  if (!job) {
    return NextResponse.json(
      { ok: false, message: "Job not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, status: job.status, failureReason: job.failureReason });
}
