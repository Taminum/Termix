// --- owlery ---
// Оболочка раздела «Мониторинг» (Фаза C). Даёт бренд + секц-навигацию и
// содержимое: «Парк» и «Тревоги» — нативный React (над hub JSON-API), «Сеть»/
// «Сроки» и деталь хоста — пока iframe хаба под /monitoring (у страниц хаба во
// встроенном режиме скрыт свой <header> — навигацию даёт эта оболочка). По мере
// Фазы C секции переезжают на нативный React по одной.

import { useCallback, useEffect, useState } from "react";
import { FleetPanel } from "./FleetPanel";
import { AlertsPanel } from "./AlertsPanel";

type SectionKey = "park" | "network" | "alerts" | "expiries";

const SECTIONS: { key: SectionKey; label: string; path?: string }[] = [
  { key: "park", label: "Парк" },
  { key: "network", label: "Сеть", path: "/monitoring/network" },
  { key: "alerts", label: "Тревоги" }, // нативная панель, без iframe-пути
  { key: "expiries", label: "Сроки", path: "/monitoring/expiries" },
];

const NATIVE: SectionKey[] = ["park", "alerts"];

export function MonitoringView() {
  const [section, setSection] = useState<SectionKey>("park");
  // Непустой = показываем iframe детали хоста (открыт кликом из «Парка»/«Тревог»).
  const [hostPath, setHostPath] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState<number>(0);

  const selectSection = (key: SectionKey) => {
    setSection(key);
    setHostPath(null);
  };
  const openHostDetail = useCallback((id: string) => {
    setHostPath(`/monitoring/host/${encodeURIComponent(id)}`);
  }, []);

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

  const sectionPath = SECTIONS.find((s) => s.key === section)?.path ?? null;
  const showNative = hostPath == null && NATIVE.includes(section);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-base font-bold text-foreground">🦉 Owlery</span>
        <span className="text-xs text-muted-foreground">пульт парка</span>
        <nav className="ml-auto flex items-center gap-1">
          {SECTIONS.map((s) => {
            const active = section === s.key && !hostPath;
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

      <div className="min-h-0 flex-1">
        {showNative && section === "park" ? (
          <FleetPanel onOpenHost={openHostDetail} />
        ) : showNative && section === "alerts" ? (
          <AlertsPanel onOpenHost={openHostDetail} />
        ) : (
          <iframe
            // key по пути: смена секции перезагружает iframe на нужную страницу
            key={hostPath ?? sectionPath ?? "blank"}
            src={hostPath ?? sectionPath ?? "/monitoring/"}
            title="Owlery — мониторинг"
            className="h-full w-full border-0 bg-background"
          />
        )}
      </div>
    </div>
  );
}
