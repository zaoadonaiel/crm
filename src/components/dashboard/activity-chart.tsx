"use client";

import { useState } from "react";

type Point = { day: string; sent: number; received: number; clients: number };

const series = [
  { key: "sent", label: "Emails sent", color: "#f26b4e" },
  { key: "received", label: "Replies received", color: "#6366f1" },
  { key: "clients", label: "Clients added", color: "#10b981" },
] as const;

export function ActivityChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = 220;
  const pad = { l: 32, r: 12, t: 12, b: 26 };
  const max = Math.max(4, ...data.flatMap((d) => [d.sent, d.received, d.clients]));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max];

  const path = (key: (typeof series)[number]["key"]) =>
    data
      .map((d, i) => {
        const px = x(i);
        const py = y(d[key]);
        if (i === 0) return `M${px},${py}`;
        const prevX = x(i - 1);
        const prevY = y(data[i - 1]![key]);
        const cx = (prevX + px) / 2;
        return `C${cx},${prevY} ${cx},${py} ${px},${py}`;
      })
      .join(" ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[13px]">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % Math.ceil(data.length / 10) === 0 ? (
              <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </text>
            ) : null,
          )}
          <defs>
            <linearGradient id="g-sent" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f26b4e" stopOpacity="0.18" />
              <stop offset="1" stopColor="#f26b4e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path("sent")} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#g-sent)" />
          {series.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />}
          {data.map((_, i) => (
            <rect
              key={i}
              x={x(i) - (W - pad.l - pad.r) / data.length / 2}
              y={0}
              width={(W - pad.l - pad.r) / data.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: `min(calc(${(x(hover) / W) * 100}% + 8px), calc(100% - 160px))` }}
          >
            <p className="mb-1 font-semibold">{new Date(data[hover].day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <b>{data[hover]![s.key]}</b>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
