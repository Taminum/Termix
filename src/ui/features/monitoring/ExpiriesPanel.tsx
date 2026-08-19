// --- owlery ---
// Нативная панель «Сроки» (Фаза C): сроки годности сертификатов и доменов хаба
// поверх JSON-API (/monitoring/api/expiries). Заменяет iframe на этом экране.

import { useCallback, useEffect, useState } from "react";

const EXPIRIES_URL = "/monitoring/api/expiries";
const REFRESH_MS = 30_000;

interface Expiry {
  label: string;
  type: string; // "tls" | "domain" | ...
  target: string;
  org: string;
  expires_at: number | null;
  days: number | null;
  sev: string; // "crit" | "warn" | ""
  error?: string | null;
}

function statusDot(e: Expiry): string {
  if (e.error) return "⚪";
  if (e.sev === "crit") return "🔴";
  if (e.sev === "warn") return "🟠";
  return "🟢";
}

function Remaining({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">—</span>;
  if (days < 0)
    return (
      <span style={{ color: "var(--crit, #f85149)" }}>
        истёк {Math.round(-days)} дн. назад
      </span>
    );
  return <span>~{Math.round(days)} дн.</span>;
}

export function ExpiriesPanel() {
  const [rows, setRows] = useState<Expiry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(EXPIRIES_URL, { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      setRows((await r.json()) as Expiry[]);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (rows == null) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        {error ? (
          <span className="text-sm text-muted-foreground">Ошибка загрузки</span>
        ) : (
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70" />
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-full w-full overflow-y-auto px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Список пуст. Задай цели в YAML и укажи путь в{" "}
          <code className="rounded bg-muted/50 px-1">OWLERY_EXPIRY_CONFIG</code>{" "}
          — пример{" "}
          <code className="rounded bg-muted/50 px-1">
            deploy/config/expiries.example.yaml
          </code>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto px-5 py-4">
      <table className="w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-2 py-1.5 font-medium"></th>
            <th className="px-2 py-1.5 font-medium">что</th>
            <th className="px-2 py-1.5 font-medium">цель</th>
            <th className="px-2 py-1.5 font-medium">клиент</th>
            <th className="px-2 py-1.5 font-medium">осталось</th>
            <th className="px-2 py-1.5 font-medium">примечание</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={`${e.target}-${i}`} className="border-t border-border">
              <td className="px-2 py-1.5">{statusDot(e)}</td>
              <td className="px-2 py-1.5">
                <div className="font-semibold text-foreground">{e.label}</div>
                <div className="text-[11px] text-muted-foreground">{e.type}</div>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{e.target}</td>
              <td className="px-2 py-1.5">{e.org}</td>
              <td className="px-2 py-1.5 tabular-nums">
                <Remaining days={e.days} />
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {e.error ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
