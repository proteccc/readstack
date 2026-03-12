import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  const redirectUrl = new URL("/", request.url);
  return NextResponse.redirect(redirectUrl);
}

