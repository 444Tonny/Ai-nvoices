"use client";

import { useState } from "react";
import { formatHoursMinutes, secondsToHours } from "@/lib/format";
import type { NamedSeconds } from "@/lib/domain/stats";

/**
 * Barres horizontales d'une seule série (heures par client ou par projet).
 * Une seule teinte (SecondaryBg), extrémité arrondie ancrée à la ligne de base,
 * valeur affichée en texte neutre et info-bulle au survol.
 */
export function BarList({ data, emptyLabel }: { data: NamedSeconds[]; emptyLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="py-10 text-center text-muted">{emptyLabel}</p>;
  }
  const top = data.slice(0, 10);
  const rest = data.slice(10);
  const rows = rest.length
    ? [...top, { name: `Autres (${rest.length})`, seconds: rest.reduce((s, x) => s + x.seconds, 0) }]
    : top;
  const max = Math.max(...rows.map((d) => d.seconds), 1);
  const total = rows.reduce((s, d) => s + d.seconds, 0);

  return (
    <ul className="flex flex-col gap-1" role="list">
      {rows.map((d, i) => {
        const pct = (d.seconds / max) * 100;
        const share = total > 0 ? Math.round((d.seconds / total) * 100) : 0;
        return (
          <li
            key={d.name}
            className="relative grid grid-cols-[minmax(90px,170px)_1fr_auto] items-center gap-4 rounded-ui px-2 py-2 transition-colors duration-150 hover:bg-surface-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="truncate text-[13px] text-text" title={d.name}>
              {d.name}
            </span>
            <span className="relative h-[14px]">
              <span
                className="absolute inset-y-0 left-0 transition-colors duration-150"
                style={{
                  width: `max(${pct}%, 3px)`,
                  background: hover === i ? "var(--secondary-hover)" : "var(--secondary)",
                  borderRadius: "0 4px 4px 0",
                }}
              />
            </span>
            <span className="tabular text-right text-[13px] text-muted">{formatHoursMinutes(d.seconds)}</span>
            {hover === i && (
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-ui border border-border bg-surface-3 px-3 py-1.5 text-[12px] text-text shadow-lg"
              >
                {d.name} · {secondsToHours(d.seconds).toLocaleString("fr-FR")} h · {share} %
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
