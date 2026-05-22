import type {
  ExtensionAPI,
  ContextUsage,
  ToolCallEvent,
  ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR_WIDTH = 10;

function bar(pct: number): string {
  const f = Math.round((pct / 100) * BAR_WIDTH);
  return "▓".repeat(f) + "░".repeat(BAR_WIDTH - f);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function getMcpCachePath(): string {
  const dir = process.env.PI_CODING_AGENT_DIR?.trim();
  if (!dir) return join(homedir(), ".pi", "agent", "mcp-cache.json");
  if (dir === "~") return join(homedir(), "mcp-cache.json");
  if (dir.startsWith("~/")) return join(homedir(), dir.slice(2), "mcp-cache.json");
  return join(dir, "mcp-cache.json");
}

export default function (pi: ExtensionAPI) {
  const toolCounts = new Map<string, number>();
  let modelLabel = "";
  let cachedUsage: ContextUsage | undefined;
  let cwd = "";
  let triggerRender: (() => void) | null = null;
  let footerData: ReadonlyFooterDataProvider | null = null;

  const SEP = "   ·   ";

  // Row 1: cwd · branch ············ context bar   provider / model
  function buildStatusLine(width: number, theme: any): string {
    const leftParts: string[] = [];

    if (cwd) leftParts.push(cwd.replace(homedir(), "~"));

    const branch = footerData?.getGitBranch();
    if (branch && branch !== "detached") leftParts.push(`⎇ ${branch}`);

    const rightParts: string[] = [];

    if (cachedUsage?.percent != null) {
      const pct = Math.round(cachedUsage.percent);
      const tokens =
        cachedUsage.tokens != null
          ? `${fmtK(cachedUsage.tokens)}/${fmtK(cachedUsage.contextWindow)}`
          : fmtK(cachedUsage.contextWindow);
      rightParts.push(`${bar(pct)} ${pct}%  ${tokens}`);
    }

    if (modelLabel) rightParts.push(theme.fg("dim", modelLabel));

    const left = leftParts.join(SEP);
    const right = rightParts.join(SEP);

    if (!left && !right) return "";
    if (!right) return left;
    if (!left) return right;

    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);

    if (leftWidth + 2 + rightWidth >= width) {
      return truncateToWidth(left, width - rightWidth - 2, "…") + "  " + right;
    }

    const pad = " ".repeat(width - leftWidth - rightWidth);
    return left + pad + right;
  }

  // Row 2: MCP  server-name (n)  ·  server-name (n)
  function buildMcpLine(theme: any): string {
    const cachePath = getMcpCachePath();
    if (!existsSync(cachePath)) return "";
    try {
      const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
      const servers: Record<string, { tools?: unknown[] }> = cache?.servers ?? {};
      const parts = Object.entries(servers)
        .filter(([, entry]) => (entry?.tools?.length ?? 0) > 0)
        .map(([name, entry]) => `${name} (${entry.tools!.length})`);
      if (parts.length === 0) return "";
      const title = theme.bold(theme.fg("accent", "Connected MCPs"));
      return `${title}  ${parts.join("  ·  ")}`;
    } catch {
      return "";
    }
  }

  // Row 3: ⚙ total  tool×n  tool×n  ...
  function buildToolLine(width: number): string {
    if (toolCounts.size === 0) return "";

    const total = [...toolCounts.values()].reduce((a, b) => a + b, 0);
    const sorted = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
    const prefix = `⚙ ${total}  `;
    const budget = width - prefix.length;

    const labels: string[] = [];
    let used = 0;
    let remaining = sorted.length;

    for (const [name, n] of sorted) {
      remaining--;
      const label = n > 1 ? `${name}×${n}` : name;
      const suffix = remaining > 0 ? `  +${remaining} more` : "";
      const needed = (labels.length > 0 ? 2 : 0) + label.length + suffix.length;

      if (used + needed > budget && labels.length > 0) {
        labels.push(`+${remaining + 1} more`);
        break;
      }

      labels.push(label);
      used += (labels.length > 1 ? 2 : 0) + label.length;
    }

    return prefix + labels.join("  ");
  }

  pi.on("session_start", (_e, ctx) => {
    toolCounts.clear();
    cachedUsage = ctx.getContextUsage();
    cwd = ctx.cwd;
    if (ctx.model) modelLabel = `${ctx.model.provider} / ${ctx.model.name}`;

    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, fd: ReadonlyFooterDataProvider) => {
      footerData = fd;
      triggerRender = () => tui.requestRender();

      const unsubBranch = fd.onBranchChange(() => tui.requestRender());

      return {
        render(width: number): string[] {
          const lines: string[] = [];
          const status = buildStatusLine(width, theme);
          if (status) lines.push(status);
          const mcp = buildMcpLine(theme);
          if (mcp) lines.push(mcp);
          const tools = buildToolLine(width);
          if (tools) lines.push(tools);
          return lines;
        },
        invalidate(): void {},
        dispose() {
          unsubBranch();
          triggerRender = null;
          footerData = null;
        },
      };
    });
  });

  pi.on("tool_call", (event: ToolCallEvent, _ctx) => {
    toolCounts.set(event.toolName, (toolCounts.get(event.toolName) ?? 0) + 1);
    triggerRender?.();
  });

  pi.on("message_end", (_e, ctx) => {
    cachedUsage = ctx.getContextUsage();
    triggerRender?.();
  });

  pi.on("model_select", (event, _ctx) => {
    modelLabel = `${event.model.provider} / ${event.model.name}`;
    triggerRender?.();
  });
}
