"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/actions/auth";
import { TodayTotal } from "@/components/timer/timer-widget";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/calendar", label: "Calendrier", icon: "📅" },
  { href: "/clients", label: "Clients", icon: "◉" },
  { href: "/projects", label: "Projets", icon: "▤" },
  { href: "/tasks", label: "Tâches", icon: "☰" },
  { href: "/invoices", label: "Factures", icon: "🧾" },
  { href: "/settings", label: "Profils émetteur", icon: "⚙" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        className="btn btn-icon fixed left-4 top-4 z-40 lg:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        ☰
      </button>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col gap-6 border-r border-border bg-surface-1 px-4 py-6 transition-transform duration-150 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-ui bg-primary text-on-fill">⏱</span>
          <span className="text-[18px] font-semibold">AI-nvoices</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-ui px-3 py-2.5 text-[14px] transition-colors duration-150 ${
                  active ? "bg-secondary text-text" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <span className="w-5 text-center" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <TodayTotal />
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="truncate px-1 text-[13px] text-muted" title={email}>
              {email}
            </p>
            <form action={signOut}>
              <button type="submit" className="btn btn-sm w-full">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
