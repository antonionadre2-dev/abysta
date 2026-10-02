import { Suspense } from "react";
import { DirectoryScreen } from "@/components/directory/directory-pages";
import { DirectoryLoading } from "@/components/directory/directory-ui";

export default function Page({ params }: { params: Promise<{ tenantId: string; clientId: string; siteId: string }> }) {
  return <Suspense fallback={<DirectoryLoading />}><DirectoryScreen params={params} screen="site" /></Suspense>;
}
