// --- owlery ---
// Встроенный дашборд мониторинга Owlery. Хаб-бэкенд отдаётся под /monitoring
// той же оболочкой (Caddy forward-auth пускает только с валидной сессией Termix),
// поэтому единый вход работает автоматически: cookie тот же самый (same-origin).
//
// Пока это embed самих серверных страниц хаба (Фаза B). В Фазе C ключевые
// панели переедут на нативный React и hub-JSON-API.

const MONITORING_URL = "/monitoring/";

// DOM-нода таба стабильна (AppShell портит контент в постоянную ноду), поэтому
// iframe не перемонтируется при переключении вкладок — сессия/скролл сохраняются.
export function MonitoringTab() {
  return (
    <iframe
      src={MONITORING_URL}
      title="Owlery — мониторинг"
      className="h-full w-full border-0 bg-background"
    />
  );
}
