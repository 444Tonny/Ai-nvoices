import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { faStopwatch } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-ui bg-primary text-xl font-semibold text-on-fill">
            <Icon icon={faStopwatch} />
          </div>
          <h1 className="text-[26px]">AI-nvoices</h1>
          <p className="mt-2 text-muted">Suivi du temps et facturation pour freelances</p>
        </div>
        <LoginForm next={safeNext} initialError={error === "lien" ? "Lien invalide ou expiré. Demandez-en un nouveau." : undefined} />
        {safeNext?.startsWith("/oauth/") && <p className="mt-4 text-center text-[13px] text-muted">Connectez-vous pour autoriser l&apos;accès de votre assistant.</p>}
      </div>
    </main>
  );
}
