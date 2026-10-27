"use client";

import { useActionState, useState } from "react";
import { signInWithMagicLink, signInWithPassword, signUp, type AuthState } from "@/actions/auth";

type Mode = "password" | "signup" | "magic";

const TABS: { id: Mode; label: string }[] = [
  { id: "password", label: "Connexion" },
  { id: "signup", label: "Inscription" },
  { id: "magic", label: "Magic link" },
];

export function LoginForm({ initialError, next }: { initialError?: string; next?: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [pwState, pwAction, pwPending] = useActionState<AuthState, FormData>(signInWithPassword, { error: initialError });
  const [suState, suAction, suPending] = useActionState<AuthState, FormData>(signUp, {});
  const [mlState, mlAction, mlPending] = useActionState<AuthState, FormData>(signInWithMagicLink, {});

  const state = mode === "password" ? pwState : mode === "signup" ? suState : mlState;
  const action = mode === "password" ? pwAction : mode === "signup" ? suAction : mlAction;
  const pending = mode === "password" ? pwPending : mode === "signup" ? suPending : mlPending;

  return (
    <div className="card p-6 sm:p-8">
      <div className="mb-6 grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`btn btn-sm ${mode === t.id ? "btn-primary" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form action={action} className="space-y-5" key={mode}>
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="vous@exemple.com" />
        </div>
        {mode !== "magic" && (
          <div>
            <label className="label" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="input"
            />
          </div>
        )}

        {state.error && <p className="rounded-ui border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{state.error}</p>}
        {state.message && <p className="rounded-ui border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Patientez…" : mode === "password" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Recevoir le lien"}
        </button>
      </form>
    </div>
  );
}
