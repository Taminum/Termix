// --- owlery ---
// Нативная деталь хоста (Фаза C): мета, сессия-в-клик, история метрик (графики),
// прогноз диска, пинги, Windows-инвентарь, место/входящие, ранбуки — всё поверх
// hub JSON-API (/monitoring/api/host/{id} и .../series). Заменяет iframe.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSSHHosts, type SSHHostWithStatus } from "@/main-axios";
import { LineChart, type LineChartSeries } from "@/components/charts/LineChart";

const API = "/monitoring/api/host";
const CMD_URL = "/monitoring/v1/admin/commands";
const META_REFRESH_MS = 15_000;

// ── типы ответа /api/host/{id} ────────────────────────────────────────────
interface Agent {
  agent_id: string;
  hostname: string;
  os: string;
  os_version: string;
  agent_version: string;
  org: string;
  last_seen: number;
  online: boolean;
}
interface Forecast {
  days_to_full: number | null;
  slope_bytes_per_day: number;
  used_percent: number;
  points: number;
  reason: string;
}
interface Ping {
  target: string;
  up: boolean;
  rtt: number | null;
}
interface Command {
  id: number;
  action: string;
  params?: string;
  status: string;
  result?: string;
}
interface WinDisk {
  name: string;
  health: string;
}
interface WinService {
  name: string;
  display?: string;
}
interface Windows {
  pending_reboot: boolean;
  pending_reboot_reasons?: string[];
  windows_update: { last_patch_kb?: string | null; days_since?: number | null };
  disks: WinDisk[];
  services_down: WinService[];
  services_total: number;
  eventlog: {
    critical: number;
    error: number;
    latest?: { provider: string; event_id: number; message: string } | null;
  };
  backup: { status: string };
}
interface TopDir {
  path: string;
  bytes: number;
}
interface DiskUsage {
  root: string;
  partial?: boolean;
  top_dirs?: TopDir[];
}
interface Inbound {
  local_port: number;
  remote_ip: string;
  remote_port: number;
  process?: string;
}
interface Facts {
  _ts?: number;
  errors?: unknown[];
  windows?: Windows;
  disk_usage?: DiskUsage[];
  inbound?: Inbound[];
}
interface HostData {
  agent: Agent;
  now: number;
  facts: Facts | null;
  forecast: Forecast;
  forecast_sev: string;
  pings: Ping[];
  commands: Command[];
  control_available: boolean;
}

function humanBytes(n: number): string {
  let v = Math.abs(n);
  for (const u of ["Б", "КБ", "МБ", "ГБ", "ТБ"]) {
    if (v < 1024 || u === "ТБ") return `${v.toFixed(1)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(1)} ТБ`;
}
function humanBps(v: number): string {
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let x = v;
  while (Math.abs(x) >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(1)} ${u[i]}`;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\.local$/, "").trim();
}

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {title}
        {extra && (
          <span className="text-xs font-normal text-muted-foreground">
            {extra}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

// Плитка Windows-факта с цветной левой границей по важности.
function WFact({
  label,
  value,
  sub,
  sev,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  sev?: "warn" | "crit";
}) {
  const color =
    sev === "crit"
      ? "var(--crit, #f85149)"
      : sev === "warn"
        ? "var(--warn, #d29922)"
        : "var(--border)";
  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2.5"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-foreground">{value}</div>
      {sub && (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── График одной метрики (fetch серии + LineChart) ────────────────────────
const CHART_DEFS: {
  key: string;
  title: string;
  color: string;
  bytes?: boolean;
}[] = [
  { key: "cpu", title: "CPU, %", color: "var(--accent-brand)" },
  { key: "mem", title: "RAM, %", color: "var(--chart-3, #3fb950)" },
  { key: "disk", title: "Диск, %", color: "var(--chart-4, #d29922)" },
  { key: "net_recv", title: "Сеть ↓", color: "var(--chart-2, #a371f7)", bytes: true },
  { key: "net_sent", title: "Сеть ↑", color: "var(--chart-5, #f778ba)", bytes: true },
];

function MetricChart({
  agentId,
  spec,
  minutes,
}: {
  agentId: string;
  spec: (typeof CHART_DEFS)[number];
  minutes: number;
}) {
  const [ts, setTs] = useState<string[]>([]);
  const [vals, setVals] = useState<(number | null)[]>([]);
  const [state, setState] = useState<"load" | "ok" | "empty" | "err">("load");

  useEffect(() => {
    let cancelled = false;
    setState("load");
    fetch(
      `${API}/${encodeURIComponent(agentId)}/series?metric=${spec.key}&minutes=${minutes}`,
      { credentials: "same-origin" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { t: number[]; v: (number | null)[] }) => {
        if (cancelled) return;
        const t = d.t ?? [];
        if (!t.length) {
          setState("empty");
          return;
        }
        setTs(t.map((s) => new Date(s * 1000).toISOString()));
        setVals(d.v ?? []);
        setState("ok");
      })
      .catch(() => !cancelled && setState("err"));
    return () => {
      cancelled = true;
    };
  }, [agentId, spec.key, minutes]);

  const maxV = spec.bytes
    ? Math.max(1024, ...vals.map((v) => (v == null ? 0 : v)))
    : 100;
  const series: LineChartSeries[] = [
    { key: spec.key, label: spec.title, color: spec.color, data: vals },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {spec.title}
      </div>
      {state === "ok" ? (
        <LineChart
          series={series}
          timestamps={ts}
          domain={[0, maxV]}
          yFormatter={spec.bytes ? humanBps : (v) => `${v.toFixed(0)}%`}
          height={150}
        />
      ) : (
        <div className="flex h-[150px] items-center justify-center text-sm text-muted-foreground">
          {state === "load"
            ? "…"
            : state === "empty"
              ? "нет данных за период"
              : "ошибка загрузки"}
        </div>
      )}
    </div>
  );
}

// ── Ранбуки (admin-токен + белый список действий) ─────────────────────────
function Runbooks({
  agentId,
  commands,
}: {
  agentId: string;
  commands: Command[];
}) {
  const [tok, setTok] = useState(
    () => localStorage.getItem("owlery_admin_tok") ?? "",
  );

  const run = async (action: string) => {
    const t = tok.trim();
    if (!t) {
      alert("Введи admin-токен");
      return;
    }
    localStorage.setItem("owlery_admin_tok", t);
    let params: Record<string, string> = {};
    let confirmed = false;
    if (action === "restart_service") {
      const s = prompt("Имя службы:");
      if (!s) return;
      params = { service: s };
    } else if (action === "wol") {
      const m = prompt("MAC (aa:bb:cc:dd:ee:ff):");
      if (!m) return;
      params = { mac: m };
    } else if (action === "reboot") {
      if (!confirm(`Перезагрузить ${agentId}? Это разрушительное действие.`))
        return;
      confirmed = true;
    } else if (action === "clear_temp") {
      if (!confirm(`Очистить temp на ${agentId}?`)) return;
    }
    try {
      const r = await fetch(CMD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": t },
        body: JSON.stringify({ agent_id: agentId, action, params, confirmed }),
        credentials: "same-origin",
      });
      const d = await r.json();
      alert(
        r.status === 200
          ? `Команда #${d.id} поставлена: ${action}`
          : `Ошибка ${r.status}: ${d.detail ?? ""}`,
      );
    } catch (e) {
      alert("Сеть: " + e);
    }
  };

  const btn =
    "rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-accent-brand/60";
  return (
    <Section title="Управление · ранбуки">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        admin-токен:
        <input
          type="password"
          value={tok}
          onChange={(e) => setTok(e.target.value)}
          placeholder="X-Admin-Token"
          className="w-56 rounded-md border border-border bg-muted/40 px-2 py-1 text-foreground"
        />
        <span className="text-xs">(хранится в браузере локально)</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => run("restart_service")}>
          Перезапустить службу
        </button>
        <button className={btn} onClick={() => run("clear_temp")}>
          Очистить temp
        </button>
        <button className={btn} onClick={() => run("wol")}>
          Wake-on-LAN
        </button>
        <button
          className={`${btn} hover:!border-destructive hover:!text-destructive`}
          onClick={() => run("reboot")}
        >
          Перезагрузить хост
        </button>
      </div>
      {commands.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full max-w-3xl border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1 font-medium">#</th>
                <th className="px-2 py-1 font-medium">действие</th>
                <th className="px-2 py-1 font-medium">статус</th>
                <th className="px-2 py-1 font-medium">результат</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-2 py-1 text-muted-foreground">{c.id}</td>
                  <td className="px-2 py-1">
                    {c.action}
                    {c.params && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {c.params}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">{c.status}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {c.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────
export function HostDetailPanel({
  agentId,
  onBack,
}: {
  agentId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<HostData | null>(null);
  const [error, setError] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [termixHosts, setTermixHosts] = useState<SSHHostWithStatus[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/${encodeURIComponent(agentId)}`, {
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as HostData);
      setError(false);
    } catch {
      setError(true);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), META_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    getSSHHosts()
      .then(setTermixHosts)
      .catch(() => setTermixHosts([]));
  }, []);

  const termixHost = useMemo(() => {
    const keys = [normalizeName(agentId), normalizeName(data?.agent.hostname ?? "")];
    return termixHosts.find(
      (h) =>
        keys.includes(normalizeName(h.name)) ||
        (h.ip && keys.includes(normalizeName(h.ip))),
    );
  }, [termixHosts, agentId, data]);

  const openSession = (type: "terminal" | "rdp") => {
    if (!termixHost) return;
    window.dispatchEvent(
      new CustomEvent("termix:open-tab", {
        detail: { hostId: String(termixHost.id), type },
      }),
    );
  };

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

  const { agent, now, facts, forecast, forecast_sev, pings, commands } = data;
  const w = facts?.windows;
  const badDisks = w?.disks.filter((d) => d.health !== "Healthy") ?? [];
  const sessBtn =
    "rounded border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent-brand/60 hover:text-accent-brand";

  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      <button
        onClick={onBack}
        className="mb-2 text-sm text-muted-foreground hover:text-accent-brand"
      >
        ← парк
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`size-2.5 shrink-0 rounded-full ${
            agent.online ? "bg-emerald-500" : "bg-muted-foreground/40"
          }`}
        />
        <h2 className="text-lg font-semibold text-foreground">
          {agent.agent_id}
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {agent.online ? "онлайн" : "офлайн"}
        </span>
        {termixHost && (
          <div className="ml-2 flex gap-1">
            {termixHost.enableSsh !== false && (
              <button className={sessBtn} onClick={() => openSession("terminal")}>
                SSH
              </button>
            )}
            {termixHost.enableRdp && (
              <button className={sessBtn} onClick={() => openSession("rdp")}>
                RDP
              </button>
            )}
          </div>
        )}
      </div>

      <table className="mb-5 text-sm text-muted-foreground">
        <tbody>
          <tr>
            <td className="py-0.5 pr-6">Клиент</td>
            <td className="text-foreground">{agent.org}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-6">Хост</td>
            <td className="text-foreground">{agent.hostname || "—"}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-6">ОС</td>
            <td className="text-foreground">
              {agent.os} {agent.os_version}
            </td>
          </tr>
          <tr>
            <td className="py-0.5 pr-6">Агент</td>
            <td className="text-foreground">v{agent.agent_version}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-6">Последний heartbeat</td>
            <td className="text-foreground">{now - agent.last_seen}s назад</td>
          </tr>
        </tbody>
      </table>

      {data.control_available && (
        <Runbooks agentId={agent.agent_id} commands={commands} />
      )}

      {forecast.points > 0 && (
        <Section title={`Прогноз диска (${forecast.points} точек)`}>
          <div
            className="max-w-lg rounded-lg border border-border bg-card px-3 py-2.5"
            style={{
              borderLeftWidth: 3,
              borderLeftColor:
                forecast_sev === "crit"
                  ? "var(--crit, #f85149)"
                  : forecast_sev === "warn"
                    ? "var(--warn, #d29922)"
                    : "var(--border)",
            }}
          >
            {forecast.days_to_full != null ? (
              <>
                <div className="font-semibold text-foreground">
                  полон через ~{Math.round(forecast.days_to_full)} дн.
                </div>
                <div className="text-xs text-muted-foreground">
                  {(forecast.slope_bytes_per_day / 1073741824).toFixed(1)} ГБ/день ·
                  занято {Math.round(forecast.used_percent)}%
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-foreground">
                  {forecast.reason === "не растёт"
                    ? "диск не растёт"
                    : forecast.reason}
                </div>
                <div className="text-xs text-muted-foreground">
                  занято {Math.round(forecast.used_percent)}%
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {pings.length > 0 && (
        <Section title={`Пинг-мониторинг (${pings.length})`}>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {pings.map((p) => (
              <div
                key={p.target}
                className="rounded-lg border border-border bg-card px-3 py-2"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: p.up
                    ? "var(--border)"
                    : "var(--crit, #f85149)",
                }}
              >
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span
                    className={`size-1.5 rounded-full ${p.up ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                  />
                  {p.target}
                </div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {p.up
                    ? p.rtt != null
                      ? `${Math.round(p.rtt)} ms`
                      : "—"
                    : "не отвечает"}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {w && (
        <Section
          title="Windows · инвентарь"
          extra={`снят ${now - (facts?._ts ?? now)}s назад${
            facts?.errors?.length ? `, ошибки сбора: ${facts.errors.length}` : ""
          }`}
        >
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <WFact
              label="Перезагрузка"
              value={w.pending_reboot ? "ждёт ⟳" : "не нужна"}
              sub={w.pending_reboot ? w.pending_reboot_reasons?.join(", ") : undefined}
              sev={w.pending_reboot ? "crit" : undefined}
            />
            <WFact
              label="Патчи (WU)"
              value={w.windows_update.last_patch_kb || "—"}
              sub={
                w.windows_update.days_since != null
                  ? `${w.windows_update.days_since} дн. назад`
                  : "дата неизв."
              }
            />
            <WFact
              label="Диски · SMART"
              value={`${w.disks.length} шт · ${badDisks.length === 0 ? "все Healthy" : `${badDisks.length} проблемных`}`}
              sub={badDisks.map((d) => `${d.name} — ${d.health}`).join("; ") || undefined}
              sev={badDisks.length ? "crit" : undefined}
            />
            <WFact
              label="Службы (auto ↓)"
              value={
                <>
                  {w.services_down.length}{" "}
                  <span className="font-normal text-muted-foreground">
                    / {w.services_total}
                  </span>
                </>
              }
              sub={w.services_down
                .slice(0, 5)
                .map((s) => s.display || s.name)
                .join("; ")}
              sev={w.services_down.length ? "warn" : undefined}
            />
            <WFact
              label="События · час"
              value={`${w.eventlog.critical} crit · ${w.eventlog.error} err`}
              sub={
                w.eventlog.latest
                  ? `${w.eventlog.latest.provider} #${w.eventlog.latest.event_id}`
                  : undefined
              }
              sev={w.eventlog.critical + w.eventlog.error ? "warn" : undefined}
            />
            <WFact
              label="Бэкап"
              value={
                { ok: "ок", stale: "устарел", none: "нет", unknown: "?" }[
                  w.backup.status
                ] ?? w.backup.status
              }
              sev={["stale", "none"].includes(w.backup.status) ? "warn" : undefined}
            />
          </div>
        </Section>
      )}

      {facts?.disk_usage
        ?.filter((d) => d.top_dirs?.length)
        .map((drive) => {
          const mx = Math.max(1, ...(drive.top_dirs ?? []).map((d) => d.bytes));
          return (
            <Section
              key={drive.root}
              title={`Куда уходит место · ${drive.root}`}
              extra={drive.partial ? "(оценка неполная)" : undefined}
            >
              <div className="flex max-w-xl flex-col gap-1.5">
                {drive.top_dirs?.map((d) => (
                  <div key={d.path} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{d.path}</div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-muted/40">
                        <div
                          className="h-full rounded bg-accent-brand/70"
                          style={{ width: `${(100 * d.bytes) / mx}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                      {humanBytes(d.bytes)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          );
        })}

      {facts?.inbound && facts.inbound.length > 0 && (
        <Section title={`⚠ Сторож входящих: чужие соединения (${facts.inbound.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1 font-medium">лок. порт</th>
                  <th className="px-2 py-1 font-medium">откуда</th>
                  <th className="px-2 py-1 font-medium">процесс</th>
                </tr>
              </thead>
              <tbody>
                {facts.inbound.map((c, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 tabular-nums">{c.local_port}</td>
                    <td className="px-2 py-1">
                      {c.remote_ip}:{c.remote_port}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {c.process || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Период:</span>
        {[
          { m: 60, l: "1ч" },
          { m: 360, l: "6ч" },
          { m: 1440, l: "24ч" },
        ].map((r) => (
          <button
            key={r.m}
            onClick={() => setMinutes(r.m)}
            className={`rounded border px-2 py-0.5 text-xs ${
              minutes === r.m
                ? "border-accent-brand text-accent-brand"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {CHART_DEFS.map((spec) => (
          <MetricChart
            key={spec.key}
            agentId={agentId}
            spec={spec}
            minutes={minutes}
          />
        ))}
      </div>
    </div>
  );
}
