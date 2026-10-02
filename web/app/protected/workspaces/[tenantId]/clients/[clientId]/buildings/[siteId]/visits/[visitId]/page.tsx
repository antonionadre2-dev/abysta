import { Suspense } from "react";
import { VisitScreen } from "@/components/site-visits/visit-pages";
import { VisitLoading } from "@/components/site-visits/visit-ui";

export default function Page({ params }: { params: Promise<{ tenantId: string; clientId: string; siteId: string; visitId: string }> }) {
  return <Suspense fallback={<VisitLoading />}><VisitScreen params={params} screen="detail" /></Suspense>;
}
