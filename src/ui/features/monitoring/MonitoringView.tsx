// --- owlery ---
// Оболочка раздела «Мониторинг» (Фаза C). Бренд + секц-навигация и содержимое:
// «Парк»/«Тревоги»/«Сроки» и деталь хоста — нативный React (над hub JSON-API),
// «Сеть» — пока iframe хаба под /monitoring (у страниц хаба во встроенном режиме
// скрыт свой <header> — навигацию даёт эта оболочка).

import { useCallback, useEffect, useState } from "react";
import { FleetPanel } from "./FleetPanel";
import { AlertsPanel } from "./AlertsPanel";
import { ExpiriesPanel } from "./ExpiriesPanel";
import { NetworkPanel } from "./NetworkPanel";
import { HostDetailPanel } from "./HostDetailPanel";

type SectionKey = "park" | "network" | "alerts" | "expiries";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "park", label: "Парк" },
  { key: "network", label: "Сеть" },
  { key: "alerts", label: "Тревоги" },
  { key: "expiries", label: "Сроки" },
];

export function MonitoringView() {
  const [section, setSection] = useState<SectionKey>("park");
  // Непустой = нативная деталь конкретного хоста (открыта из «Парка»/«Тревог»).
  const [hostId, setHostId] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState<number>(0);

  const selectSection = (key: SectionKey) => {
    setSection(key);
    setHostId(null);
  };
  const openHostDetail = useCallback((id: string) => setHostId(id), []);

  // Счётчик активных тревог для бейджа на пункте «Тревоги» (виден всегда).
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetch("/monitoring/api/alerts", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : []))
        .then((a) => {
          if (!cancelled) setAlertCount(Array.isArray(a) ? a.length : 0);
        })
        .catch(() => {});
    void poll();
    const id = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  let body: React.ReactNode;
  if (hostId) {
    body = <HostDetailPanel agentId={hostId} onBack={() => setHostId(null)} />;
  } else if (section === "park") {
    body = <FleetPanel onOpenHost={openHostDetail} />;
  } else if (section === "alerts") {
    body = <AlertsPanel onOpenHost={openHostDetail} />;
  } else if (section === "expiries") {
    body = <ExpiriesPanel />;
  } else {
    body = <NetworkPanel />;
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-base font-bold text-foreground">🦉 Owlery</span>
        <span className="text-xs text-muted-foreground">пульт парка</span>
        <nav className="ml-auto flex items-center gap-1">
          {SECTIONS.map((s) => {
            const active = section === s.key && !hostId;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSection(s.key)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors ${
                  active
                    ? "bg-accent-brand/10 text-accent-brand"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {s.label}
                {s.key === "alerts" && alertCount > 0 && (
                  <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
