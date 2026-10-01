"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateCompanyForm } from "./validation";
import type { CompanyActionState } from "./types";

export async function createCompanyAction(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/auth/login");

  const validation = validateCompanyForm(formData);
  if (!validation.ok) return validation.state;
  const { values } = validation;
  if (!auth.user.email_confirmed_at) {
    return { error: "Confirm your email before creating a company.", values };
  }

  let result;
  try {
    // The database derives the owner from auth.uid(). This uses the user's
    // session and the publishable key, never service_role or a browser role.
    result = await supabase.rpc("create_operator_tenant", {
      p_name: values.name,
      p_currency: values.currency,
      p_timezone: values.timezone,
      p_request_id: values.requestId,
    });
  } catch {
    return {
      error: "We couldn’t confirm the save. Try again with the same details; we’ll check the first request.",
      values,
    };
  }

  if (result.error) {
    const message = result.error.message;
    if (message === "ABYSTA_ALREADY_HAS_WORKSPACE") {
      revalidatePath("/protected");
      redirect("/protected");
    }
    const errors: Record<string, string> = {
      AUTH_REQUIRED: "Your session has expired. Sign in again.",
      EMAIL_NOT_VERIFIED: "Confirm your email before creating a company.",
      INVALID_COMPANY_NAME: "Check your company name and try again.",
      INVALID_CURRENCY: "Choose a currency from the list.",
      INVALID_TIMEZONE: "Choose a valid time zone.",
      INVALID_REQUEST_ID: "This form has expired. Reload the page and try again.",
      REQUEST_KEY_REUSED: "This request was already saved with different details. Reload to view your company.",
      COMPANY_ACCESS_REVOKED: "Your access to this company has changed. Contact its owner.",
    };
    return {
      error: errors[message] ?? "We couldn’t save your company. Please try again shortly.",
      values,
    };
  }
  if (typeof result.data !== "string") {
    return { error: "We couldn’t confirm the save. Reload to check your company before trying again.", values };
  }

  revalidatePath("/protected");
  redirect("/protected");
}
