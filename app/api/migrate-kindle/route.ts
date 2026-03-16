import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Migrates a guest Kindle email into the user's account.
// No-op if the user already has a Kindle destination set up.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { kindleEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const kindleEmail = body.kindleEmail?.trim();
  if (!kindleEmail || !emailRegex.test(kindleEmail)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const existing = await db.deliveryDestination.findFirst({
    where: { userId: user.id, kind: "kindle" },
  });

  if (existing) {
    return NextResponse.json({ ok: true, migrated: false });
  }

  await db.deliveryDestination.create({
    data: { userId: user.id, kind: "kindle", email: kindleEmail, isPrimary: true },
  });

  return NextResponse.json({ ok: true, migrated: true });
}
