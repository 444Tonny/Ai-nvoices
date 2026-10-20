import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types";
import { INVOICE_STATUS } from "@/lib/labels";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="text-[28px] text-dim">○</div>
      <p className="text-[15px] text-text">{title}</p>
      {hint && <p className="max-w-md text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Texte tronqué avec ellipse et tooltip natif. */
export function Truncate({ text, className = "", max = 260 }: { text: string | null | undefined; className?: string; max?: number }) {
  if (!text) return <span className="text-dim">—</span>;
  return (
    <span className={`truncate-cell ${className}`} style={{ maxWidth: max }} title={text}>
      {text}
    </span>
  );
}

/** Lien texte nu (couleur Primary) tronqué, utilisé pour les noms cliquables des tables. */
export function NameLink({ href, text, max = 260 }: { href: string; text: string; max?: number }) {
  return (
    <Link href={href} className="link truncate-cell" style={{ maxWidth: max }} title={text}>
      {text}
    </Link>
  );
}


export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = INVOICE_STATUS[status];
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card px-6 py-5">
      <p className="label mb-2">{label}</p>
      <p className="duration text-[26px] font-semibold leading-tight">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-dim">{hint}</p>}
    </div>
  );
}

export function Field({ label, htmlFor, children, error }: { label: string; htmlFor?: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
