"use client";

import { useState } from "react";
import type { ApiToken } from "@/lib/types";
import { createTokenAction, revokeTokenAction } from "@/actions/tokens";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/format";
import { useTimer } from "@/components/timer/timer-provider";

/** Jetons d'accès personnels pour connecter un agent (Claude) via MCP. */
export function TokensManager({ tokens, mcpUrl }: { tokens: ApiToken[]; mcpUrl: string }) {
  const { exec, pending } = useAction();
  const { confirm, toast } = useFeedback();
  const { tz } = useTimer();
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<string | null>(null);

  const command = (token: string) => `claude mcp add --transport http ai-nvoices ${mcpUrl} --header "Authorization: Bearer ${token}"`;

  const create = async () => {
    const res = await exec(() => createTokenAction(name), "Jeton créé");
    if (res.ok && res.data) setCreated(res.data.token);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copié dans le presse-papiers", "success");
    } catch {
      toast("Copie impossible : sélectionnez le texte manuellement.", "error");
    }
  };

  const revoke = async (t: ApiToken) => {
    if (await confirm({ message: `Révoquer le jeton « ${t.name} » ? Les agents qui l'utilisent perdront l'accès immédiatement.`, confirmLabel: "Révoquer" })) {
      await exec(() => revokeTokenAction(t.id), "Jeton révoqué");
    }
  };

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <section className="card px-6 py-5">
      <h2 className="mb-1 text-[18px]">Accès MCP (Claude)</h2>
      <p className="mb-5 max-w-3xl text-[14px] text-muted">
        Un jeton permet à Claude de se connecter à AI-nvoices pour créer des tâches, saisir du temps, piloter le timer et préparer vos factures. Il n&apos;a accès qu&apos;à vos
        données. Point d&apos;accès : <code className="rounded-ui bg-surface-2 px-1.5 py-0.5 text-text">{mcpUrl}</code>
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <input className="input max-w-[260px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du jeton" aria-label="Nom du jeton" />
        <button type="button" className="btn btn-primary" onClick={create} disabled={pending || !name.trim()}>
          + Créer un jeton
        </button>
      </div>

      {active.length === 0 ? (
        <p className="text-[14px] text-dim">Aucun jeton actif.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Jeton</th>
                <th>Créé le</th>
                <th>Dernière utilisation</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="tabular text-muted">{t.token_prefix}…</td>
                  <td className="tabular whitespace-nowrap">{formatDateTime(t.created_at, tz)}</td>
                  <td className="tabular whitespace-nowrap">{t.last_used_at ? formatDateTime(t.last_used_at, tz) : <span className="text-dim">Jamais</span>}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => revoke(t)} disabled={pending}>
                      Révoquer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={created !== null} onClose={() => setCreated(null)} title="Jeton créé" width={680}>
        {created && (
          <div className="flex flex-col gap-4">
            <p className="text-warning">Copiez ce jeton maintenant : il ne sera plus jamais affiché.</p>
            <div className="flex gap-2">
              <input className="input tabular" readOnly value={created} onFocus={(e) => e.target.select()} aria-label="Jeton" />
              <button type="button" className="btn" onClick={() => copy(created)}>
                Copier
              </button>
            </div>
            <div>
              <p className="label">Connexion depuis Claude Code</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-ui border border-border bg-surface-2 p-3 text-[12px] text-text">{command(created)}</pre>
              <button type="button" className="btn btn-sm mt-2" onClick={() => copy(command(created))}>
                Copier la commande
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
