"use client";

import { useEffect, useState } from "react";
import type { InvoiceTemplate } from "@/lib/types";
import { deleteTemplatesAction, saveTemplateAction } from "@/actions/invoices";
import { createClient } from "@/lib/supabase/client";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Field, Truncate } from "@/components/ui/misc";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";

const FIELDS = [
  { key: "company_name", label: "Raison sociale / nom" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "website", label: "Site web" },
  { key: "tax_number", label: "N° TVA / SIRET" },
] as const;

type Form = {
  name: string;
  company_name: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  bank_details: string;
  tax_number: string;
  logo_url: string;
  default_footer_text: string;
};

const empty: Form = {
  name: "",
  company_name: "",
  address: "",
  email: "",
  phone: "",
  website: "",
  bank_details: "",
  tax_number: "",
  logo_url: "",
  default_footer_text: "",
};

function TemplateFormModal({ open, onClose, template, userId }: { open: boolean; onClose: () => void; template: InvoiceTemplate | null; userId: string }) {
  const { exec, pending } = useAction();
  const { toast } = useFeedback();
  const [form, setForm] = useState<Form>(empty);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      template
        ? (Object.fromEntries(Object.keys(empty).map((k) => [k, (template[k as keyof InvoiceTemplate] as string | null) ?? ""])) as Form)
        : empty,
    );
  }, [open, template]);

  const upload = async (file: File) => {
    if (!["image/png", "image/jpeg"].includes(file.type)) return toast("Logo : formats PNG ou JPEG uniquement.", "error");
    if (file.size > 2 * 1024 * 1024) return toast("Logo : 2 Mo maximum.", "error");
    setUploading(true);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return toast(`Envoi du logo impossible : ${error.message}`, "error");
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setForm((f) => ({ ...f, logo_url: data.publicUrl }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveTemplateAction(template?.id ?? null, form), template ? "Profil mis à jour" : "Profil créé");
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      title={template ? "Modifier le profil émetteur" : "Nouveau profil émetteur"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="template-form" className="btn btn-primary" disabled={pending || uploading}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom du profil" htmlFor="tp-name">
          <input id="tp-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-autofocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`tp-${f.key}`}>
              <input id={`tp-${f.key}`} className="input" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Field label="Adresse" htmlFor="tp-address">
          <textarea id="tp-address" className="textarea" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Coordonnées bancaires" htmlFor="tp-bank">
          <textarea id="tp-bank" className="textarea" rows={3} value={form.bank_details} onChange={(e) => setForm({ ...form, bank_details: e.target.value })} placeholder="IBAN, BIC…" />
        </Field>
        <Field label="Pied de page par défaut des factures" htmlFor="tp-footer">
          <textarea
            id="tp-footer"
            className="textarea"
            rows={5}
            value={form.default_footer_text}
            onChange={(e) => setForm({ ...form, default_footer_text: e.target.value })}
            placeholder="Ex. : conditions de paiement, coordonnées bancaires, contact… Prérempli dans chaque nouvelle facture de ce profil."
          />
        </Field>
        <div>
          <span className="label">Logo (PNG ou JPEG, 2 Mo max.)</span>
          <div className="flex flex-wrap items-center gap-4">
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Logo" className="h-14 max-w-[160px] rounded-ui border border-border bg-white object-contain p-1" />
            ) : (
              <span className="text-dim">Aucun logo</span>
            )}
            <label className="btn btn-sm cursor-pointer">
              {uploading ? "Envoi…" : "Choisir un fichier"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {form.logo_url && (
              <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, logo_url: "" })}>
                Retirer
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function TemplatesManager({ templates, userId }: { templates: InvoiceTemplate[]; userId: string }) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(templates.map((t) => t.id));
  const [editing, setEditing] = useState<InvoiceTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = async (ids: string[]) => (await exec(() => deleteTemplatesAction(ids), "Suppression effectuée")).ok;
  const removeOne = async (t: InvoiceTemplate) => {
    if (await confirm(`Supprimer le profil « ${t.name} » ? Les factures qui l'utilisent n'auront plus d'émetteur.`)) await remove([t.id]);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BulkBar selection={selection} onDelete={remove} noun="profil" disabled={pending || templates.length === 0} />
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + Nouveau profil
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState title="Aucun profil émetteur" hint="Un profil contient les informations de votre entreprise affichées sur les factures." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Logo</th>
                <th>Profil</th>
                <th>Entreprise</th>
                <th>Email</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className={selection.has(t.id) ? "row-selected" : ""}>
                  <td>
                    <RowCheckbox selection={selection} id={t.id} />
                  </td>
                  <td>
                    {t.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logo_url} alt="" className="h-9 max-w-[90px] rounded-ui bg-white object-contain p-0.5" />
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="link truncate-cell" title={t.name} onClick={() => setEditing(t)}>
                      {t.name}
                    </button>
                  </td>
                  <td>
                    <Truncate text={t.company_name} />
                  </td>
                  <td>
                    <Truncate text={t.email} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(t)}>
                        ✎
                      </button>
                      <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(t)} disabled={pending}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TemplateFormModal open={creating || editing !== null} template={editing} userId={userId} onClose={() => (setCreating(false), setEditing(null))} />
    </>
  );
}
