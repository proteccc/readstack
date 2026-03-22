import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const kindleEmailRegex = /^[^\s@]+@kindle\.com$/i;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  let body: { kindleEmail?: string; secondaryEmail?: string } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const kindleEmail = body.kindleEmail?.trim();
  const secondaryEmail = body.secondaryEmail?.trim() || null;

  if (!kindleEmail) {
    return NextResponse.json(
      { ok: false, message: "Kindle email is required." },
      { status: 400 }
    );
  }

  if (!kindleEmailRegex.test(kindleEmail)) {
    return NextResponse.json(
      { ok: false, message: "Kindle email must end in @kindle.com." },
      { status: 400 }
    );
  }

  if (secondaryEmail && !emailRegex.test(secondaryEmail)) {
    return NextResponse.json(
      { ok: false, message: "Invalid secondary email address." },
      { status: 400 }
    );
  }

  await db.$transaction(async (tx) => {
    await tx.deliveryDestination.deleteMany({ where: { userId: user.id } });

    const toCreate = [
      { userId: user.id, kind: "kindle", email: kindleEmail, isPrimary: true },
      ...(secondaryEmail
        ? [{ userId: user.id, kind: "email", email: secondaryEmail, isPrimary: false }]
        : []),
    ];

    await tx.deliveryDestination.createMany({ data: toCreate });
  });

  return NextResponse.json({ ok: true });
}
