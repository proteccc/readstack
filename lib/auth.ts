import { db } from "@/lib/db";
import { getSupabaseUser } from "@/lib/supabase/server";

/**
 * Returns the current authenticated Prisma user, or null if not signed in.
 *
 * This function:
 * - Reads the Supabase auth user from cookies
 * - Upserts a corresponding row in the Prisma User table
 * - Returns the Prisma User record for use elsewhere in the app
 */
export async function getCurrentUser() {
  const supabaseUser = await getSupabaseUser();

  if (!supabaseUser || !supabaseUser.email) {
    return null;
  }

  const user = await db.user.upsert({
    where: { id: supabaseUser.id },
    update: {
      email: supabaseUser.email,
    },
    create: {
      id: supabaseUser.id,
      email: supabaseUser.email,
    },
  });

  return user;
}

