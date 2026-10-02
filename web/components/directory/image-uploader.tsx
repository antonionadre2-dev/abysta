"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { directoryImageUrl } from "@/lib/directory/image-url";
import type { DirectoryImageActionState, DirectoryImageKind } from "@/lib/directory/image-types";

type Props = {
  tenantId: string;
  kind: DirectoryImageKind;
  recordId: string;
  rowVersion: number;
  currentAssetId?: string | null;
};

export function DirectoryImageUploader(props: Props) {
  return <ImageEditor key={`${props.recordId}:${props.rowVersion}:${props.currentAssetId ?? "none"}`} {...props} />;
}

function ImageEditor({ tenantId, kind, recordId, rowVersion, currentAssetId }: Props) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const tokens = useRef<{ requestId: string; assetId: string; operation: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<DirectoryImageActionState>({});
  const [pending, setPending] = useState(false);
  const [savedVersion, setSavedVersion] = useState(rowVersion);
  const [savedAssetId, setSavedAssetId] = useState(currentAssetId ?? null);
  const label = kind === "site" ? "Building image" : kind === "client" ? "Client logo" : "Company logo";
  const assetId = savedAssetId;

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file, pending]);

  async function submit(operation: "upload" | "remove") {
    if (pending || (operation === "upload" && !file)) return;
    if (operation === "remove" && !window.confirm("Remove this image from the record? Its saved version will be retained.")) return;
    if (!tokens.current || tokens.current.operation !== operation) {
      tokens.current = { requestId: crypto.randomUUID(), assetId: crypto.randomUUID(), operation };
    }
    const form = new FormData();
    form.set("tenant_id", tenantId);
    form.set("kind", kind);
    form.set("record_id", recordId);
    form.set("expected_version", String(savedVersion));
    form.set("operation", operation);
    form.set("request_id", tokens.current.requestId);
    form.set("asset_id", tokens.current.assetId);
    if (file && operation === "upload") form.set("image", file);
    setPending(true);
    try {
      const response = await fetch("/api/directory-images", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = await response.json() as DirectoryImageActionState;
      if (!response.ok && !result.error) throw new Error("Image request failed");
      setState(result);
      if (result.success) {
        setSavedVersion(result.rowVersion!);
        setSavedAssetId(result.assetId ?? null);
        setFile(null);
        tokens.current = null;
        if (inputRef.current) inputRef.current.value = "";
      } else {
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setState({ error: "The connection was interrupted. Keep this page open and retry." });
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label={label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950" aria-busy={pending}>
      <h2 className="font-semibold text-slate-950 dark:text-white">{label}</h2>
      <div className="mt-4 flex flex-col gap-5">
        <div className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-900">
          {previewUrl || assetId ? (
            // Private authenticated image proxy must not use a public optimisation cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl ?? directoryImageUrl(tenantId, assetId!)} alt={label} className={`h-full w-full ${kind === "site" ? "object-cover" : "object-contain p-3"}`} />
          ) : <ImagePlus aria-hidden="true" className="h-9 w-9 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p id={`${inputId}-help`} className="text-sm text-slate-600 dark:text-slate-400">PNG, JPEG or WebP, up to 3 MiB. Still images only. Images are resized to 1,600 pixels and location metadata is removed.</p>
          <label htmlFor={inputId} className="block text-sm font-medium">Choose {kind === "site" ? "an image" : "a logo"}</label>
          <input id={inputId} ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} aria-describedby={`${inputId}-help`} className="block min-w-0 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 dark:file:bg-slate-800" onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            tokens.current = null;
            if (selected && (selected.size > 3 * 1024 * 1024 || (selected.type && !["image/png", "image/jpeg", "image/webp"].includes(selected.type)))) {
              setFile(null);
              event.target.value = "";
              setState({ error: "Choose a PNG, JPEG or WebP image up to 3 MiB." });
              requestAnimationFrame(() => errorRef.current?.focus());
              return;
            }
            setFile(selected);
            setState({});
          }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || !file || state.conflict} onClick={() => void submit("upload")}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />}
              {pending ? "Saving image…" : assetId ? "Replace image" : "Upload image"}
            </Button>
            {assetId && <Button type="button" variant="outline" disabled={pending || state.conflict} onClick={() => void submit("remove")}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Remove</Button>}
            {state.conflict && <Button type="button" variant="outline" onClick={() => router.refresh()}>Refresh record</Button>}
          </div>
          {state.error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{state.error}</p>}
          <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">{state.success ? "Image saved." : pending ? "Uploading and checking the image…" : ""}</p>
        </div>
      </div>
    </section>
  );
}
