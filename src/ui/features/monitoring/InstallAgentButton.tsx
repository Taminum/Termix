// --- owlery ---
// Кнопка «Установить агент Owlery» на SSH-терминале хоста (Фаза E).
// В один клик: enroll на хабе (подпись делает изолированный signer) → готовую
// команду установки шлём прямо в открытую SSH-сессию (term.sendInput). Никаких
// ручных шагов — агент скачивается, ставится службой и приходит в парк.

import { useState } from "react";
import { toast } from "sonner";
import type { Host } from "@/types/ui-types";
import type { TerminalHandle } from "@/features/terminal/Terminal";

function toAgentId(host: Host): string {
  const base = (host.name || host.ip || "host").toLowerCase();
  return base.replace(/[^a-z0-9._-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "host";
}

export function InstallAgentButton({
  host,
  terminalRef,
}: {
  host: Host;
  terminalRef?: React.RefObject<TerminalHandle | null> | null;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const agentId = toAgentId(host);
    const org = host.folder || "default";
    if (
      !confirm(
        `Установить агент Owlery на «${host.name}»?\n` +
          `id: ${agentId}\nклиент: ${org}\n\n` +
          `Команда выполнится в этой SSH-сессии (нужен sudo).`,
      )
    )
      return;

    setBusy(true);
    try {
      const r = await fetch("/monitoring/api/agent/enroll", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, org }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${r.status}`);
      }
      const { install_cmd } = (await r.json()) as { install_cmd: string };
      const term = terminalRef?.current;
      if (!term?.sendInput) throw new Error("нет доступа к терминалу");
      term.sendInput(install_cmd + "\n");
      toast.success("Устанавливаю агент — смотри вывод в терминале");
    } catch (e) {
      toast.error("Установка агента: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Установить агент Owlery на этот хост (в один клик)"
      className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-accent-brand/60 hover:text-accent-brand disabled:opacity-50"
    >
      {busy ? (
        <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70" />
      ) : (
        "🦉"
      )}
      Установить агент
    </button>
  );
}
