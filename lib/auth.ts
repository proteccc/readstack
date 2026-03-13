import { db } from "@/lib/db";
import { getSupabaseUser } from "@/lib/supabase/server";

/**
 * Returns the current authenticated Prisma user, or null if not signed in.
 *
 * Uses findUnique on the common path (returning users) to avoid a write lock
 * on every request. Falls back to create only on first sign-in.
 */
export async function getCurrentUser() {
  const supabaseUser = await getSupabaseUser();

  if (!supabaseUser || !supabaseUser.email) {
    return null;
  }

  const existing = await db.user.findUnique({
    where: { id: supabaseUser.id },
  });

  if (existing) {
    return existing;
  }

  return db.user.create({
    data: {
      id: supabaseUser.id,
      email: supabaseUser.email,
    },
  });
}

