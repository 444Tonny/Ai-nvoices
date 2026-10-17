"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { saveClientAction } from "@/actions/catalog";
import { CURRENCIES, getSymbol } from "@/lib/currency";
import type { Client } from "@/lib/types";

const empty = { name: "", hourly_rate: "", currency: "EUR", email: "", phone: "", address: "" };

export function ClientFormModal({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client | null }) {
  const { exec, pending } = useAction();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(
      client
        ? {
            name: client.name,
            hourly_rate: String(client.hourly_rate).replace(".", ","),
            currency: client.currency,
            email: client.email ?? "",
            phone: client.phone ?? "",
            address: client.address ?? "",
          }
        : empty,
    );
  }, [open, client]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveClientAction(client?.id ?? null, form), client ? "Client mis à jour" : "Client créé");
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Modifier le client" : "Nouveau client"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="client-form" className="btn btn-primary" disabled={pending}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom" htmlFor="c-name">
          <input id="c-name" className="input" value={form.name} onChange={set("name")} required data-autofocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Taux horaire (${getSymbol(form.currency)}/h)`} htmlFor="c-rate">
            <input id="c-rate" className="input" inputMode="decimal" placeholder="0,00" value={form.hourly_rate} onChange={set("hourly_rate")} />
          </Field>
          <Field label="Devise" htmlFor="c-currency">
            <select id="c-currency" className="select" value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({getSymbol(c)})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="c-email">
            <input id="c-email" type="email" className="input" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Téléphone" htmlFor="c-phone">
            <input id="c-phone" className="input" value={form.phone} onChange={set("phone")} />
          </Field>
        </div>
        <Field label="Adresse" htmlFor="c-address">
          <textarea id="c-address" className="textarea" value={form.address} onChange={set("address")} rows={3} />
        </Field>
      </form>
    </Modal>
  );
}
