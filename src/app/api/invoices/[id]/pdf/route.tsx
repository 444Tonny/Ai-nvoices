import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceDetail } from "@/lib/domain/invoices";
import { InvoicePdf, type PdfLogo } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Génération PDF : laisse de la marge au démarrage à froid de la fonction serverless.
export const maxDuration = 30;

/** Télécharge le logo du profil émetteur (PNG/JPEG, 2 Mo max). Un échec n'empêche pas le PDF. */
async function loadLogo(url: string | null | undefined): Promise<PdfLogo | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return null;
    if (type.includes("png") || buf.subarray(0, 4).toString("hex") === "89504e47") return { data: buf, format: "png" };
    if (type.includes("jpeg") || type.includes("jpg") || buf.subarray(0, 2).toString("hex") === "ffd8") return { data: buf, format: "jpg" };
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/invoices/[id]/pdf : génère le PDF côté serveur.
 * Les heures d'une facture « unpaid » sont synchronisées avant l'export.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const detail = await getInvoiceDetail(supabase, id).catch(() => null);
  if (!detail) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const logo = await loadLogo(detail.template?.logo_url);
  const buffer = await renderToBuffer(<InvoicePdf detail={detail} logo={logo} />);

  const filename = `facture-${detail.invoice.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
