import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types";
import { INVOICE_STATUS } from "@/lib/labels";
import { faArrowRight, faInbox, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

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
      <Icon icon={faInbox} className="text-[28px] text-dim" />
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

/** Carte de statistique ; avec `href`, toute la carte est un lien. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  hintTone = "dim",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: IconDefinition;
  href?: string;
  hintTone?: "dim" | "danger";
}) {
  const body = (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="label mb-0">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-ui bg-secondary/60 text-primary">
            <Icon icon={icon} />
          </span>
        )}
      </div>
      <p className="duration text-[26px] font-semibold leading-tight">{value}</p>
      {hint && <p className={`mt-1 text-[13px] ${hintTone === "danger" ? "text-danger" : "text-dim"}`}>{hint}</p>}
      {href && (
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-primary">
          Voir <Icon icon={faArrowRight} className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card group block px-6 py-5 transition-colors duration-150 hover:border-primary/60">
        {body}
      </Link>
    );
  }
  return <div className="card px-6 py-5">{body}</div>;
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
