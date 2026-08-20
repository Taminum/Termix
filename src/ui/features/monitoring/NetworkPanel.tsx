// --- owlery ---
// Нативная панель «Сеть» (Фаза C): карта сети объектов поверх hub JSON-API
// (/monitoring/api/network[/{id}]). Список снимков → деталь (роутер, устройства,
// соседи-топология). Заменяет iframe.

import { useCallback, useEffect, useState } from "react";

const API = "/monitoring/api/network";
const REFRESH_MS = 30_000;

interface Router {
  reachable?: boolean;
  identity?: string;
  address?: string;
  model?: string;
  version?: string;
  error?: string;
}
interface ScanRow {
  agent_id: string;
  org: string;
  router: Router;
  devices: number;
  new: number; // Фаза E: сколько новых/rogue устройств
  ago: number;
}
interface Device {
  ip: string;
  mac: string;
  hostname?: string;
  source: string;
  dynamic?: boolean;
  new?: boolean; // Фаза E: недавно появившийся MAC
}
interface Change {
  id: number;
  agent_id: string;
  org: string;
  ts: number;
  kind: string; // new | gone
  mac: string;
  ip: string;
  hostname: string;
}
interface Neighbor {
  interface: string;
  identity?: string;
  ip?: string;
  platform?: string;
}
interface Scan {
  router: Router;
  devices: Device[];
  neighbors?: Neighbor[];
  _ts: number;
}
interface ScanDetail {
  scan: Scan;
  agent_id: string;
  now: number;
}

function Dot({ on }: { on?: boolean }) {
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
    />
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-1 text-left font-medium">{children}</th>;
}

function NetworkDetail({
  agentId,
  onBack,
}: {
  agentId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<ScanDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/${encodeURIComponent(agentId)}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ScanDetail) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (!data) {
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

  const { scan, now } = data;
  const r = scan.router ?? {};
  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      <button
        onClick={onBack}
        className="mb-2 text-sm text-muted-foreground hover:text-accent-brand"
      >
        ← сеть
      </button>
      <div className="mb-3 flex items-center gap-2">
        <Dot on={r.reachable} />
        <h2 className="text-lg font-semibold text-foreground">
          {r.identity || "сеть объекта"}
        </h2>
      </div>

      <table className="mb-5 text-sm text-muted-foreground">
        <tbody>
          <tr>
            <td className="py-0.5 pr-6">Роутер</td>
            <td className="text-foreground">
              {r.address || "—"}
              {r.address && !r.reachable && (
                <span style={{ color: "var(--crit, #f85149)" }}>
                  {" "}
                  · недоступен: {r.error}
                </span>
              )}
            </td>
          </tr>
          {r.model && (
            <tr>
              <td className="py-0.5 pr-6">Модель</td>
              <td className="text-foreground">{r.model}</td>
            </tr>
          )}
          {r.version && (
            <tr>
              <td className="py-0.5 pr-6">RouterOS</td>
              <td className="text-foreground">{r.version}</td>
            </tr>
          )}
          <tr>
            <td className="py-0.5 pr-6">Снято</td>
            <td className="text-foreground">
              {now - scan._ts}s назад · агент {agentId}
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="mb-2 text-sm font-semibold text-foreground">
        Устройства ({scan.devices.length})
      </h3>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full max-w-3xl border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <Th>IP</Th>
              <Th>MAC</Th>
              <Th>имя</Th>
              <Th>источник</Th>
            </tr>
          </thead>
          <tbody>
            {scan.devices.map((d, i) => (
              <tr
                key={i}
                className="border-t border-border"
                style={
                  d.new
                    ? { background: "color-mix(in srgb, var(--crit, #f85149) 8%, transparent)" }
                    : undefined
                }
              >
                <td className="px-2 py-1 tabular-nums">
                  {d.ip}
                  {d.new && (
                    <span
                      className="ml-2 rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: "var(--crit, #f85149)" }}
                    >
                      новое
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{d.mac}</td>
                <td className="px-2 py-1">{d.hostname || "—"}</td>
                <td className="px-2 py-1 text-muted-foreground">
                  {d.source}
                  {d.dynamic ? " · dyn" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scan.neighbors && scan.neighbors.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Соседи · топология ({scan.neighbors.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <Th>интерфейс</Th>
                  <Th>identity</Th>
                  <Th>IP</Th>
                  <Th>платформа</Th>
                </tr>
              </thead>
              <tbody>
                {scan.neighbors.map((n, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 text-muted-foreground">
                      {n.interface}
                    </td>
                    <td className="px-2 py-1">{n.identity || "—"}</td>
                    <td className="px-2 py-1 tabular-nums">{n.ip || "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {n.platform || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function timeAgo(sec: number): string {
  if (sec < 90) return `${sec}s назад`;
  if (sec < 5400) return `${Math.round(sec / 60)} мин назад`;
  if (sec < 172800) return `${Math.round(sec / 3600)} ч назад`;
  return `${Math.round(sec / 86400)} дн назад`;
}

export function NetworkPanel() {
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rr, cr] = await Promise.all([
        fetch(API, { credentials: "same-origin" }),
        fetch("/monitoring/api/changes", { credentials: "same-origin" }),
      ]);
      if (!rr.ok) throw new Error(String(rr.status));
      setRows((await rr.json()) as ScanRow[]);
      setChanges(cr.ok ? ((await cr.json()) as Change[]) : []);
      setNowSec(Math.floor(Date.now() / 1000));
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

  if (selected) {
    return (
      <NetworkDetail agentId={selected} onBack={() => setSelected(null)} />
    );
  }

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
          Пока нет снимков сети. Включи{" "}
          <code className="rounded bg-muted/50 px-1">netscan_enabled: true</code>{" "}
          у агента (и задай{" "}
          <code className="rounded bg-muted/50 px-1">mikrotik</code> для опроса
          роутера).
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      {changes.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            Недавние изменения
            <span
              className="rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ background: "var(--crit, #f85149)" }}
            >
              {changes.length}
            </span>
          </h3>
          <div className="flex flex-col gap-1.5">
            {changes.slice(0, 8).map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: "var(--crit, #f85149)",
                }}
              >
                <span className="font-semibold text-foreground">
                  Новое устройство
                </span>{" "}
                <span className="text-muted-foreground">
                  {c.hostname || c.ip || c.mac} ({c.mac}) · {c.org} · агент{" "}
                  {c.agent_id} · {timeAgo(nowSec - c.ts)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {rows.map((r) => (
          <button
            key={r.agent_id}
            onClick={() => setSelected(r.agent_id)}
            className="flex flex-col rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-accent-brand/60"
          >
            <div className="mb-1 flex items-center gap-2">
              <Dot on={r.router.reachable} />
              <span className="truncate font-semibold text-foreground">
                {r.router.identity || r.agent_id}
              </span>
              {r.new > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px] font-bold text-white"
                  style={{ background: "var(--crit, #f85149)" }}
                >
                  +{r.new}
                </span>
              )}
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {r.org}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {r.router.model || "—"} · {r.devices} устройств
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              агент {r.agent_id} · снято {r.ago}s назад
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
