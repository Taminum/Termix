// --- owlery ---
// Нативная панель «Тревоги» (Фаза C): активные тревоги хаба поверх JSON-API
// (/monitoring/api/alerts). Заменяет iframe на этом экране.

import { useCallback, useEffect, useState } from "react";

const ALERTS_URL = "/monitoring/api/alerts";
const REFRESH_MS = 10_000;

interface Alert {
  key: string;
  rule: string;
  scope: string;
  agent_id: string;
  org: string;
  severity: string; // "crit" | "warn" | ...
  message: string;
  since: number;
  acked: boolean;
  snoozed: boolean;
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground ${className}`}
    >
      {children}
    </span>
  );
}

function AlertCard({
  alert,
  onOpenHost,
}: {
  alert: Alert;
  onOpenHost?: (agentId: string) => void;
}) {
  const crit = alert.severity === "crit";
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: crit ? "var(--crit, #f85149)" : "var(--warn, #d29922)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{alert.rule}</Badge>
        {alert.scope === "agent" ? (
          <button
            type="button"
            onClick={() => onOpenHost?.(alert.agent_id)}
            className="font-semibold text-foreground hover:text-accent-brand"
          >
            {alert.agent_id}
          </button>
        ) : (
          <span className="font-semibold text-foreground">{alert.agent_id}</span>
        )}
        <span className="text-xs text-muted-foreground">{alert.org}</span>
        {alert.acked && (
          <Badge className="!text-emerald-500">✅ ack</Badge>
        )}
        {alert.snoozed && (
          <Badge className="!text-amber-500">😴 snooze</Badge>
        )}
      </div>
      <div className="text-sm text-foreground">{alert.message}</div>
      <div className="text-[11px] text-muted-foreground">
        с {alert.since}s назад
      </div>
    </div>
  );
}

export function AlertsPanel({
  onOpenHost,
}: {
  onOpenHost?: (agentId: string) => void;
}) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(ALERTS_URL, { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      setAlerts((await r.json()) as Alert[]);
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

  if (alerts == null) {
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

  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4">
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">✅ Активных тревог нет.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {alerts.map((a) => (
            <AlertCard key={a.key} alert={a} onOpenHost={onOpenHost} />
          ))}
        </div>
      )}
    </div>
  );
}
