// --- owlery ---
// Нативная панель «Отчёт» (Фаза E): сводка здоровья по клиенту поверх hub JSON-API
// (/monitoring/api/report). Селектор клиента + печатная выгрузка (PDF) через
// standalone-страницу хаба /monitoring/report/print.

import { useCallback, useEffect, useState } from "react";

const API = "/monitoring/api/report";

interface HostRow {
  agent_id: string;
  org: string;
  online: boolean;
  os: string;
  os_version: string;
  hostname: string;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  ago: number;
}
interface Alert {
  severity: string;
  rule: string;
  agent_id: string;
  org: string;
  message: string;
}
interface WinIssue {
  agent_id: string;
  org: string;
  issues: string[];
}
interface Expiry {
  label: string;
  type: string;
  target: string;
  org: string;
  days: number;
}
interface Change {
  ts: number;
  kind: string;
  hostname: string;
  ip: string;
  mac: string;
  org: string;
  agent_id: string;
}
interface Report {
  org: string;
  generated_at: number;
  summary: Record<string, number>;
  hosts: HostRow[];
  alerts: Alert[];
  win_issues: WinIssue[];
  expiries: Expiry[];
  changes: Change[];
  orgs_available: string[];
}

const KPIS: { key: string; label: string; sev?: "warn" | "crit" }[] = [
  { key: "hosts", label: "хостов" },
  { key: "online", label: "онлайн" },
  { key: "offline", label: "офлайн", sev: "crit" },
  { key: "alerts", label: "тревог", sev: "crit" },
  { key: "expiring", label: "сроки скоро", sev: "warn" },
  { key: "high_disk", label: "диск ≥ порога", sev: "warn" },
  { key: "win_issue_hosts", label: "Windows-проблемы", sev: "warn" },
  { key: "net_changes", label: "изм. сети", sev: "crit" },
];

function metricColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v >= 90) return "text-red-500";
  if (v >= 70) return "text-amber-500";
  return "text-foreground";
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold text-foreground">
        {title} ({count})
      </h3>
      {children}
    </section>
  );
}

export function ReportPanel() {
  const [org, setOrg] = useState<string>(""); // "" = весь парк
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = org ? `?org=${encodeURIComponent(org)}` : "";
      const r = await fetch(API + q, { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as Report);
      setError(false);
    } catch {
      setError(true);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const printUrl =
    "/monitoring/report/print" + (org ? `?org=${encodeURIComponent(org)}` : "");

  if (data == null) {
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

  const s = data.summary;
  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Отчёт здоровья
        </h2>
        <select
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          className="rounded-md border border-border bg-muted/40 px-2 py-1 text-sm text-foreground"
        >
          <option value="">весь парк</option>
          {data.orgs_available.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.open(printUrl, "_blank", "noopener")}
          className="rounded-md border border-border bg-muted/40 px-3 py-1 text-sm text-foreground transition-colors hover:border-accent-brand/60 hover:text-accent-brand"
        >
          🖨 Печать / PDF
        </button>
        {error && (
          <span className="text-xs text-amber-500">обновление не удалось</span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {KPIS.map((k) => {
          const n = s[k.key] ?? 0;
          const active = n > 0 && k.sev;
          return (
            <div
              key={k.key}
              className="min-w-[104px] rounded-lg border border-border bg-card px-3 py-2"
            >
              <div
                className={`text-2xl font-bold ${
                  active === "crit"
                    ? "text-red-500"
                    : active === "warn"
                      ? "text-amber-500"
                      : k.key === "online"
                        ? "text-emerald-500"
                        : "text-foreground"
                }`}
              >
                {n}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
            </div>
          );
        })}
      </div>

      <Section title="Хосты" count={data.hosts.length}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1"></th>
                <th className="px-2 py-1 font-medium">хост</th>
                <th className="px-2 py-1 font-medium">ОС</th>
                <th className="px-2 py-1 font-medium">CPU</th>
                <th className="px-2 py-1 font-medium">RAM</th>
                <th className="px-2 py-1 font-medium">Диск</th>
                <th className="px-2 py-1 font-medium">статус</th>
              </tr>
            </thead>
            <tbody>
              {data.hosts.map((h) => (
                <tr key={h.agent_id} className="border-t border-border">
                  <td className="px-2 py-1">{h.online ? "🟢" : "⚪"}</td>
                  <td className="px-2 py-1">
                    <span className="font-semibold text-foreground">
                      {h.agent_id}
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {h.org}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {h.os} {h.os_version}
                  </td>
                  {[h.cpu, h.mem, h.disk].map((v, i) => (
                    <td
                      key={i}
                      className={`px-2 py-1 tabular-nums ${metricColor(v)}`}
                    >
                      {v == null ? "—" : `${Math.round(v)}%`}
                    </td>
                  ))}
                  <td
                    className={`px-2 py-1 ${h.online ? "text-emerald-500" : "text-muted-foreground"}`}
                  >
                    {h.online ? "онлайн" : `офлайн ${h.ago}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Активные тревоги" count={data.alerts.length}>
        {data.alerts.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            ✅ Активных тревог нет.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.alerts.map((a, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor:
                    a.severity === "crit"
                      ? "var(--crit, #f85149)"
                      : "var(--warn, #d29922)",
                }}
              >
                <span className="font-semibold text-foreground">
                  {a.agent_id}
                </span>{" "}
                <span className="text-muted-foreground">
                  [{a.rule}] {a.message} · {a.org}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Windows-проблемы" count={data.win_issues.length}>
        {data.win_issues.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            Проблем не обнаружено.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.win_issues.map((wi, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">
                  {wi.agent_id}
                </span>{" "}
                <span className="text-muted-foreground">{wi.org}</span> —{" "}
                <span className="text-amber-500">{wi.issues.join("; ")}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Сроки — скоро" count={data.expiries.length}>
        {data.expiries.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            Ничего не истекает в ближайшее время.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.expiries.map((e, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">{e.label}</span>{" "}
                <span className="text-muted-foreground">
                  {e.type} · {e.target} · {e.org} ·{" "}
                </span>
                <span className={e.days < 0 ? "text-red-500" : "text-amber-500"}>
                  {e.days < 0
                    ? `истёк ${Math.round(-e.days)} дн. назад`
                    : `~${Math.round(e.days)} дн.`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Изменения сети — 30 дней" count={data.changes.length}>
        {data.changes.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            Изменений не зафиксировано.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.changes.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: "var(--crit, #f85149)",
                }}
              >
                <span className="font-semibold text-foreground">
                  {c.kind === "new" ? "новое" : c.kind}
                </span>{" "}
                <span className="text-muted-foreground">
                  {c.hostname || c.ip} ({c.mac}) · {c.org} · агент {c.agent_id}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
