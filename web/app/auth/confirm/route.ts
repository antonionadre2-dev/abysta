import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");
  let next = "/";

  if (requestedNext) {
    try {
      const candidate = new URL(requestedNext, request.nextUrl.origin);

      if (candidate.origin === request.nextUrl.origin) {
        next = `${candidate.pathname}${candidate.search}${candidate.hash}`;
      }
    } catch {
      // Keep the root fallback for malformed or external destinations.
    }
  }

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Recovery always opens the password form after the server has written
      // the authenticated cookie. Other email actions may use a safe local path.
      redirect(type === "recovery" ? "/auth/update-password" : next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=${encodeURIComponent("No token hash or type")}`);
}
