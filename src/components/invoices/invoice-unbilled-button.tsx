"use client";

import { useRouter } from "next/navigation";
import { createInvoiceFromUnbilledAction } from "@/actions/invoices";
import { useAction } from "@/components/ui/use-action";
import { faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

/** Crée en un clic la facture du temps non facturé d'un client. */
export function InvoiceUnbilledButton({ clientId, label }: { clientId: string; label: string }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      onClick={async () => {
        const res = await exec(() => createInvoiceFromUnbilledAction({ client_id: clientId }), "Facture créée");
        if (res.ok && res.data) router.push(`/invoices/${res.data.invoiceId}`);
      }}
    >
      <Icon icon={faFileInvoiceDollar} /> {label}
    </button>
  );
}
