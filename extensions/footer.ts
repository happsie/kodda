import type {
  ExtensionAPI,
  ContextUsage,
  ToolCallEvent,
  ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR_WIDTH = 12;

function bar(pct: number, theme: any): string {
  const f = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - f;
  const color = pct >= 80 ? "error" : pct >= 50 ? "warning" : "success";
  return theme.fg(color, "█".repeat(f)) + theme.fg("dim", "░".repeat(empty));
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export default function (pi: ExtensionAPI) {
  const toolCounts = new Map<string, number>();
  let modelLabel = "";
  let cachedUsage: ContextUsage | undefined;
  let cwd = "";
  let triggerRender: (() => void) | null = null;
  let footerData: ReadonlyFooterDataProvider | null = null;
  let diffStats: { added: number; removed: number; files: number } | null = null;
  let aheadBehind: { ahead: number; behind: number } | null = null;

  function refreshAheadBehind(): void {
    if (!cwd) return;
    try {
      const out = execSync("git rev-list --left-right --count HEAD...@{u}", {
        cwd,
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const [aheadStr, behindStr] = out.split("\t");
      const ahead = parseInt(aheadStr, 10);
      const behind = parseInt(behindStr, 10);
      aheadBehind = { ahead: isNaN(ahead) ? 0 : ahead, behind: isNaN(behind) ? 0 : behind };
    } catch {
      aheadBehind = null;
    }
  }

  function refreshDiffStats(): void {
    if (!cwd) return;
    try {
      const out = execSync("git diff HEAD --shortstat", {
        cwd,
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!out) { diffStats = null; return; }
      const filesMatch = out.match(/(\d+) files? changed/);
      const addedMatch = out.match(/(\d+) insertion/);
      const removedMatch = out.match(/(\d+) deletion/);
      diffStats = {
        files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        added: addedMatch ? parseInt(addedMatch[1], 10) : 0,
        removed: removedMatch ? parseInt(removedMatch[1], 10) : 0,
      };
    } catch {
      diffStats = null;
    }
  }

  const DOT = " · ";

  // ── Row 1: 📂 cwd  ⎇ branch [↑N ↓N]  +N -N ················· bar N%  Nk/Nk
  function buildLocationLine(width: number, theme: any): string {
    const leftParts: string[] = [];

    if (cwd) {
      const short = cwd.replace(homedir(), "~");
      leftParts.push(theme.fg("mdCode", `📂 ${short}`));
    }

    const branch = footerData?.getGitBranch();
    if (branch && branch !== "detached") {
      let branchStr = theme.fg("accent", `⎇  ${branch}`);

      if (aheadBehind != null) {
        const up = aheadBehind.ahead > 0
          ? theme.fg("success", `↑${aheadBehind.ahead}`)
          : theme.fg("dim", "↑0");
        const down = aheadBehind.behind > 0
          ? theme.fg("warning", `↓${aheadBehind.behind}`)
          : theme.fg("dim", "↓0");
        branchStr += theme.fg("dim", " [") + up + theme.fg("dim", " ") + down + theme.fg("dim", "]");
      }

      if (diffStats && (diffStats.added > 0 || diffStats.removed > 0)) {
        if (diffStats.added > 0)
          branchStr += "  " + theme.fg("toolDiffAdded", `+${diffStats.added}`);
        if (diffStats.removed > 0)
          branchStr += " " + theme.fg("toolDiffRemoved", `-${diffStats.removed}`);
      }

      leftParts.push(branchStr);
    }

    const rightParts: string[] = [];

    if (cachedUsage?.percent != null) {
      const pct = Math.round(cachedUsage.percent);
      const pctColor = pct >= 80 ? "error" : pct >= 50 ? "warning" : "success";
      const tokens = cachedUsage.tokens != null
        ? theme.fg("muted", `${fmtK(cachedUsage.tokens)}/${fmtK(cachedUsage.contextWindow)}`)
        : theme.fg("muted", fmtK(cachedUsage.contextWindow));
      rightParts.push(`${bar(pct, theme)} ${theme.fg(pctColor, `${pct}%`)}  ${tokens}`);
    }

    const left = leftParts.join(theme.fg("dim", DOT));
    const right = rightParts.join(theme.fg("dim", DOT));

    if (!left && !right) return "";
    if (!right) return left;
    if (!left) return right;

    const lw = visibleWidth(left);
    const rw = visibleWidth(right);
    if (lw + 2 + rw >= width) {
      return truncateToWidth(left, width - rw - 2, "…") + "  " + right;
    }
    return left + " ".repeat(width - lw - rw) + right;
  }

  // ── Row 2: ⚙ N  tool·N  tool·N  … ···················· provider / model
  function buildToolsLine(width: number, theme: any): string {
    const rightParts: string[] = [];
    if (modelLabel) {
      const [provider, ...rest] = modelLabel.split(" / ");
      const modelName = rest.join(" / ");
      rightParts.push(
        theme.fg("dim", provider + " / ") + theme.fg("accent", modelName)
      );
    }

    const leftParts: string[] = [];

    if (toolCounts.size > 0) {
      const total = [...toolCounts.values()].reduce((a, b) => a + b, 0);
      leftParts.push(theme.fg("mdHeading", "⚙") + " " + theme.fg("syntaxNumber", String(total)));

      const sorted = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
      const rightStr = rightParts.join(theme.fg("dim", DOT));
      const prefix = visibleWidth(leftParts[0]) + 2; // "⚙ N  "
      const budget = width - prefix - visibleWidth(rightStr) - 4;

      let used = 0;
      let remaining = sorted.length;
      const toolLabels: string[] = [];

      for (const [name, n] of sorted) {
        remaining--;
        const plain = n > 1 ? `${name}×${n}` : name;
        const suffix = remaining > 0 ? `  +${remaining}` : "";
        const needed = (toolLabels.length > 0 ? visibleWidth(DOT) : 0) + plain.length + suffix.length;

        if (used + needed > budget && toolLabels.length > 0) {
          toolLabels.push(theme.fg("dim", `+${remaining + 1} more`));
          break;
        }

        const colored = n > 1
          ? theme.fg("mdCode", name) + theme.fg("dim", "×") + theme.fg("syntaxNumber", String(n))
          : theme.fg("muted", name);
        toolLabels.push(colored);
        used += (toolLabels.length > 1 ? visibleWidth(DOT) : 0) + plain.length;
      }

      if (toolLabels.length > 0) {
        leftParts.push(toolLabels.join(theme.fg("dim", DOT)));
      }
    } else if (rightParts.length === 0) {
      return "";
    }

    const left = leftParts.join("  ");
    const right = rightParts.join(theme.fg("dim", DOT));

    if (!left) return right;
    if (!right) return left;

    const lw = visibleWidth(left);
    const rw = visibleWidth(right);
    if (lw + 2 + rw >= width) {
      return truncateToWidth(left, width - rw - 2, "…") + "  " + right;
    }
    return left + " ".repeat(width - lw - rw) + right;
  }

  pi.on("session_start", (_e, ctx) => {
    toolCounts.clear();
    cachedUsage = ctx.getContextUsage();
    cwd = ctx.cwd;
    if (ctx.model) modelLabel = `${ctx.model.provider} / ${ctx.model.name}`;
    refreshDiffStats();
    refreshAheadBehind();

    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, fd: ReadonlyFooterDataProvider) => {
      footerData = fd;
      triggerRender = () => tui.requestRender();

      const unsubBranch = fd.onBranchChange(() => {
        refreshDiffStats();
        refreshAheadBehind();
        tui.requestRender();
      });

      return {
        render(width: number): string[] {
          const lines: string[] = [];
          const loc = buildLocationLine(width, theme);
          if (loc) lines.push(loc);
          const tools = buildToolsLine(width, theme);
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
    refreshDiffStats();
    refreshAheadBehind();
    triggerRender?.();
  });

  pi.on("model_select", (event, _ctx) => {
    modelLabel = `${event.model.provider} / ${event.model.name}`;
    triggerRender?.();
  });
}
