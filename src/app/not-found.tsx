import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-[28px] font-semibold">Page introuvable</p>
      <p className="text-muted">Cet élément n&apos;existe pas ou a été supprimé.</p>
      <Link href="/" className="btn btn-primary">
        Retour au dashboard
      </Link>
    </main>
  );
}
