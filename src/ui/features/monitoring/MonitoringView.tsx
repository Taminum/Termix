// --- owlery ---
// Оболочка раздела «Мониторинг» (Фаза C). Даёт бренд + секц-навигацию и
// содержимое: «Парк» — нативный React (FleetPanel над hub JSON-API), остальные
// экраны (Сеть/Тревоги/Сроки) и деталь хоста — пока iframe хаба под /monitoring
// (у страниц хаба во встроенном режиме скрыт свой <header> — навигацию даёт эта
// оболочка). По мере Фазы C секции переезжают на нативный React по одной.

import { useState } from "react";
import { FleetPanel } from "./FleetPanel";

type SectionKey = "park" | "network" | "alerts" | "expiries";

const SECTIONS: { key: SectionKey; label: string; path?: string }[] = [
  { key: "park", label: "Парк" },
  { key: "network", label: "Сеть", path: "/monitoring/network" },
  { key: "alerts", label: "Тревоги", path: "/monitoring/alerts" },
  { key: "expiries", label: "Сроки", path: "/monitoring/expiries" },
];

export function MonitoringView() {
  const [section, setSection] = useState<SectionKey>("park");
  // Непустой = показываем iframe детали хоста (открыт кликом из «Парка»).
  const [hostPath, setHostPath] = useState<string | null>(null);

  const selectSection = (key: SectionKey) => {
    setSection(key);
    setHostPath(null);
  };

  const sectionPath = SECTIONS.find((s) => s.key === section)?.path ?? null;
  const iframePath = hostPath ?? sectionPath;
  const nativePark = section === "park" && hostPath == null;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-base font-bold text-foreground">🦉 Owlery</span>
        <span className="text-xs text-muted-foreground">пульт парка</span>
        <nav className="ml-auto flex items-center gap-1">
          {SECTIONS.map((s) => {
            const active = section === s.key && (s.key !== "park" || !hostPath);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSection(s.key)}
                className={`rounded px-2.5 py-1 text-sm transition-colors ${
                  active
                    ? "bg-accent-brand/10 text-accent-brand"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="min-h-0 flex-1">
        {nativePark ? (
          <FleetPanel
            onOpenHost={(id) =>
              setHostPath(`/monitoring/host/${encodeURIComponent(id)}`)
            }
          />
        ) : (
          <iframe
            // key по пути: смена секции перезагружает iframe на нужную страницу
            key={iframePath ?? "blank"}
            src={iframePath ?? "/monitoring/"}
            title="Owlery — мониторинг"
            className="h-full w-full border-0 bg-background"
          />
        )}
      </div>
    </div>
  );
}
