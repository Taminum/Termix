// --- owlery ---
// Нативная панель «Парк» (Фаза C): обзор всего парка по клиентам поверх
// hub JSON-API (/monitoring/api/fleet). Заменяет iframe хаба на этом экране —
// первый нативный React-экран поверх бэкенда. Cookie-сессия Termix уходит
// same-origin, Caddy forward-auth пускает на хаб.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const FLEET_URL = "/monitoring/api/fleet";
const REFRESH_MS = 10_000;

interface HostTile {
  agent_id: string;
  hostname: string;
  os: string;
  os_version: string;
  online: boolean;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  ago: number;
}
interface Org {
  org: string;
  online: number;
  total: number;
  hosts: HostTile[];
}
interface Fleet {
  orgs: Org[];
  online: number;
  total: number;
  now: number;
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const pct = value == null ? 100 : Math.max(0, Math.min(100, Math.round(value)));
  const color =
    value == null
      ? "bg-muted-foreground/25"
      : value >= 90
        ? "bg-red-500"
        : value >= 70
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div className="my-0.5 flex items-center gap-2 text-xs">
      <span className="w-9 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-muted/40">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
        {value == null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function HostCard({
  host,
  onOpen,
}: {
  host: HostTile;
  onOpen?: (agentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(host.agent_id)}
      className="flex flex-col rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-accent-brand/60"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`size-2 shrink-0 rounded-full ${
            host.online
              ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
              : "bg-muted-foreground/40"
          }`}
        />
        <span className="truncate font-semibold text-foreground">
          {host.agent_id}
        </span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {host.os} {host.os_version}
        </span>
      </div>
      <MetricBar label="CPU" value={host.cpu} />
      <MetricBar label="RAM" value={host.mem} />
      <MetricBar label="Диск" value={host.disk} />
      <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
        {host.hostname || "—"} ·{" "}
        {host.online ? `онлайн ${host.ago}s назад` : `офлайн ${host.ago}s`}
      </div>
    </button>
  );
}

export function FleetPanel({
  onOpenHost,
}: {
  onOpenHost?: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(FLEET_URL, { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      setFleet((await r.json()) as Fleet);
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

  if (fleet == null) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        {error ? (
          <span className="text-sm text-muted-foreground">
            {t("common.error", { defaultValue: "Ошибка загрузки" })}
          </span>
        ) : (
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70" />
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      <p className="mb-4 text-sm text-muted-foreground">
        {fleet.online}/{fleet.total} онлайн · {fleet.orgs.length} клиент(ов)
        {error && (
          <span className="ml-2 text-amber-500">· обновление не удалось</span>
        )}
      </p>

      {fleet.orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока нет агентов. Подними зонд — см.{" "}
          <code className="rounded bg-muted/50 px-1">agent/README.md</code>.
        </p>
      ) : (
        fleet.orgs.map((org) => (
          <section key={org.org} className="mb-7">
            <h2 className="mb-2.5 flex items-baseline gap-2 text-base font-semibold text-foreground">
              {org.org}
              <span className="text-xs font-normal text-muted-foreground">
                {org.online}/{org.total} онлайн
              </span>
            </h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {org.hosts.map((host) => (
                <HostCard
                  key={host.agent_id}
                  host={host}
                  onOpen={onOpenHost}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
