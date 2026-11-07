import { notFound } from "next/navigation";
import { ProfileDocument } from "@/components/profile-document";
import { getDb } from "@/db";
import { verifyPrintSignature } from "@/lib/export/print-url";
import { getProfile } from "@/lib/profiles/service";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Print view of one profile version, used only by the headless browser that makes the in-app PDF.
 * Reachable only with a short-lived signature, since it has no admin session.
 */
export default async function PrintProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; exp?: string; sig?: string }> }) {
  const { id } = await params;
  const { v, exp, sig } = await searchParams;
  if (!v || !exp || !sig || !verifyPrintSignature(id, Number(v), Number(exp), sig)) notFound();
  const data = await getProfile(await getDb(), id, Number(v)).catch(() => null);
  if (!data?.version) notFound();

  return (
    <>
      <style>{`@page { size: A4; margin: 16mm 16mm 20mm; } html, body { background: #fff !important; } section { break-inside: avoid; }`}</style>
      <ProfileDocument content={data.version.content} variant="print" />
    </>
  );
}
