import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceDetail } from "@/lib/domain/invoices";
import { formatMoney } from "@/lib/currency";
import { lineAmount } from "@/lib/numbers";
import { formatDay } from "@/lib/format";
import { groupByProject } from "@/lib/invoice-groups";
import type { InvoiceItemWithProject } from "@/lib/types";

/** Logo pré-chargé (les formats acceptés par @react-pdf/renderer sont PNG et JPEG). */
export interface PdfLogo {
  data: Buffer;
  format: "png" | "jpg";
}

const ACCENT = "#6B0FA0";
const INK = "#1C1C1C";
const MUTED = "#6B6B70";
const RULE = "#DCDCE0";
const BAND = "#F4EEF9";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 64, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  issuer: { maxWidth: "55%" },
  logo: { maxWidth: 140, maxHeight: 60, marginBottom: 10, objectFit: "contain" },
  company: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: MUTED },
  title: { fontSize: 24, color: ACCENT, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 10 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 },
  metaLabel: { color: MUTED, width: 90, textAlign: "right", marginRight: 8 },
  metaValue: { width: 90, textAlign: "right" },
  billTo: { marginBottom: 24, padding: 12, backgroundColor: BAND, borderRadius: 4 },
  sectionLabel: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" },
  clientName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: ACCENT, paddingBottom: 5, marginBottom: 2 },
  th: { fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: RULE },
  groupRow: { paddingTop: 10, paddingBottom: 4 },
  groupName: { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold" },
  cNum: { width: "6%" },
  cDesc: { width: "40%", paddingRight: 6 },
  cQty: { width: "10%", textAlign: "right" },
  cPrice: { width: "16%", textAlign: "right" },
  cDisc: { width: "10%", textAlign: "right" },
  cTotal: { width: "18%", textAlign: "right" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 6, borderTopWidth: 1.2, borderTopColor: ACCENT },
  grandLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ACCENT },
  block: { marginTop: 22 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 8, fontSize: 8, color: MUTED, textAlign: "center" },
});

function Lines({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <Text style={s.muted}>{text}</Text>;
}

function ItemRow({ item, index, currency }: { item: InvoiceItemWithProject; index: number; currency: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.cNum}>{index}</Text>
      <Text style={s.cDesc}>{item.description || "—"}</Text>
      <Text style={s.cQty}>{item.quantity.toFixed(2)}</Text>
      <Text style={s.cPrice}>{formatMoney(item.unit_price, currency)}</Text>
      <Text style={s.cDisc}>{item.discount > 0 ? `${item.discount}%` : "—"}</Text>
      <Text style={s.cTotal}>{formatMoney(lineAmount(item.quantity, item.unit_price, item.discount), currency)}</Text>
    </View>
  );
}

export function InvoicePdf({ detail, logo, generatedAt }: { detail: InvoiceDetail; logo: PdfLogo | null; generatedAt: string }) {
  const { invoice, client, template, items, subtotal, total } = detail;
  const currency = invoice.currency;
  const groups = groupByProject(items);
  let index = 0;

  return (
    <Document title={`Facture ${invoice.number}`} author={template?.company_name || "TimeIsMoney"} creator="TimeIsMoney">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.issuer}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo && <Image style={s.logo} src={{ data: logo.data, format: logo.format }} />}
            {template?.company_name ? <Text style={s.company}>{template.company_name}</Text> : null}
            <Lines text={template?.address} />
            <Lines text={template?.email} />
            <Lines text={template?.phone} />
            <Lines text={template?.website} />
            {template?.tax_number ? <Text style={s.muted}>N° TVA / SIRET : {template.tax_number}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>FACTURE</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>N°</Text>
              <Text style={s.metaValue}>{invoice.number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{formatDay(invoice.invoice_date)}</Text>
            </View>
            {invoice.issue_date && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Date d&apos;émission</Text>
                <Text style={s.metaValue}>{formatDay(invoice.issue_date)}</Text>
              </View>
            )}
            {invoice.due_date && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Échéance</Text>
                <Text style={s.metaValue}>{formatDay(invoice.due_date)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.billTo}>
          <Text style={s.sectionLabel}>Bill To</Text>
          {client ? (
            <>
              <Text style={s.clientName}>{client.name}</Text>
              <Lines text={client.address} />
              <Lines text={client.email} />
              <Lines text={client.phone} />
            </>
          ) : (
            <Text style={s.muted}>—</Text>
          )}
        </View>

        <View style={s.tableHead} fixed>
          <Text style={[s.th, s.cNum]}>#</Text>
          <Text style={[s.th, s.cDesc]}>Description</Text>
          <Text style={[s.th, s.cQty]}>Qté</Text>
          <Text style={[s.th, s.cPrice]}>Prix unitaire</Text>
          <Text style={[s.th, s.cDisc]}>Remise</Text>
          <Text style={[s.th, s.cTotal]}>Total</Text>
        </View>

        {groups.length > 1
          ? groups.map((g) => (
              <View key={g.name}>
                <View style={s.groupRow} wrap={false}>
                  <Text style={s.groupName}>{g.name}</Text>
                </View>
                {g.items.map((item) => (
                  <ItemRow key={item.id} item={item} index={++index} currency={currency} />
                ))}
              </View>
            ))
          : items.map((item) => <ItemRow key={item.id} item={item} index={++index} currency={currency} />)}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Sous-total</Text>
            <Text>{formatMoney(subtotal, currency)}</Text>
          </View>
          {subtotal !== total && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Remises</Text>
              <Text>-{formatMoney(subtotal - total, currency)}</Text>
            </View>
          )}
          <View style={s.grandTotal}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{formatMoney(total, currency)}</Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={s.block} wrap={false}>
            <Text style={s.sectionLabel}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {template?.bank_details ? (
          <View style={s.block} wrap={false}>
            <Text style={s.sectionLabel}>Coordonnées bancaires</Text>
            <Text>{template.bank_details}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          {invoice.footer_text ? <Text style={{ marginBottom: 3 }}>{invoice.footer_text}</Text> : null}
          <Text>Generated by TiM • {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
