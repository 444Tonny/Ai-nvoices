"use client";

import { useRouter } from "next/navigation";

/** « ← RETOUR » : revient dans l'historique du navigateur (repli sur `fallback`). */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-sm mb-5"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >
      ← Retour
    </button>
  );
}
