import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  let next = "/protected";

  if (requestedNext) {
    try {
      const candidate = new URL(requestedNext, request.nextUrl.origin);

      if (candidate.origin === request.nextUrl.origin) {
        next = `${candidate.pathname}${candidate.search}${candidate.hash}`;
      }
    } catch {
      // Keep the authenticated default for malformed or external destinations.
    }
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect(next);
    }

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/auth/error?error=${encodeURIComponent("No authentication code")}`);
}
