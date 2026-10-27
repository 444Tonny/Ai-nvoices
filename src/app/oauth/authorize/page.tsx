import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClient } from "@/lib/oauth";
import { oauthDecisionAction } from "@/actions/oauth";

export const metadata: Metadata = { title: "Autoriser l'accès" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-[460px] p-8 text-center">
        <h1 className="mb-3 text-[22px]">Demande invalide</h1>
        <p className="text-muted">{message}</p>
      </div>
    </main>
  );
}

/** Page de consentement OAuth : un client MCP (ex. Claude) demande l'accès au compte. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const query = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  if (p.response_type !== "code") return <ErrorCard message="response_type doit valoir « code »." />;
  if (!p.client_id || !p.redirect_uri) return <ErrorCard message="client_id et redirect_uri sont requis." />;
  if (!p.code_challenge || (p.code_challenge_method ?? "S256") !== "S256") return <ErrorCard message="PKCE (S256) est obligatoire." />;

  const client = await resolveClient(p.client_id);
  if (!client) return <ErrorCard message="Application inconnue. Reconnectez le connecteur depuis Claude." />;
  // Ne jamais rediriger vers une adresse non enregistrée : on s'arrête ici.
  if (!client.redirect_uris.includes(p.redirect_uri)) return <ErrorCard message="Adresse de retour non autorisée pour cette application." />;

  const appName = client.client_name ?? "Une application";
  const host = new URL(p.redirect_uri).host;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-[480px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-ui bg-primary text-xl text-on-fill">⏱</span>
          <div>
            <p className="text-[13px] uppercase tracking-wider text-muted">AI-nvoices</p>
            <h1 className="text-[20px]">Autoriser {appName} ?</h1>
          </div>
        </div>
        <p className="mb-4 text-[15px] leading-relaxed">
          <strong className="font-semibold">{appName}</strong> demande l&apos;accès à votre compte <span className="text-primary">{user.email}</span>.
        </p>
        <ul className="mb-5 flex flex-col gap-2 rounded-ui border border-border bg-surface-2 px-4 py-3 text-[14px] text-muted">
          <li>• Lire vos clients, projets, tâches, temps et factures</li>
          <li>• Créer et modifier des tâches, saisir du temps, piloter le timer</li>
          <li>• Préparer et compléter des factures</li>
        </ul>
        <p className="mb-6 text-[13px] text-dim">
          Retour vers <span className="text-muted">{host}</span>. Vous pourrez révoquer cet accès à tout moment dans Paramètres › Accès MCP.
        </p>
        <form action={oauthDecisionAction} className="flex gap-3">
          <input type="hidden" name="client_id" value={p.client_id} />
          <input type="hidden" name="redirect_uri" value={p.redirect_uri} />
          <input type="hidden" name="state" value={p.state ?? ""} />
          <input type="hidden" name="code_challenge" value={p.code_challenge} />
          <button type="submit" name="decision" value="deny" className="btn flex-1">
            Refuser
          </button>
          <button type="submit" name="decision" value="allow" className="btn btn-primary flex-1">
            Autoriser
          </button>
        </form>
      </div>
    </main>
  );
}
