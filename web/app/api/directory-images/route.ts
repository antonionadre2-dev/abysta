import { saveDirectoryImage } from "@/lib/directory/image-actions";
import { validateDirectoryImageRequestHeaders } from "@/lib/directory/image-request";
import { createClient } from "@/lib/supabase/server";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });

export async function POST(request: Request) {
  const gate = validateDirectoryImageRequestHeaders(request.url, request.headers);
  if (!gate.ok) return json({ error: gate.error }, gate.status);
  try {
    // Reject unauthenticated requests before materialising the multipart body.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return json({ error: "Sign in again before changing this image." }, 401);
    }
    const result = await saveDirectoryImage(await request.formData());
    return json(result);
  } catch {
    return json({ error: "The connection was interrupted. Keep this page open and retry." }, 500);
  }
}
