import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUBAGENT_ROLES = [
  "scout",
  "researcher",
  "planner",
  "worker",
  "reviewer",
  "context-builder",
  "oracle",
  "delegate",
] as const;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("scratch", {
    description: "Append a timestamped note to .pi/scratch.md",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /scratch <text>", "info");
        return;
      }
      const path = resolve(ctx.cwd ?? process.cwd(), ".pi/scratch.md");
      const ts = new Date().toISOString();
      appendFileSync(path, `\n<!-- ${ts} -->\n${args.trim()}\n`);
      ctx.ui.notify("Saved to .pi/scratch.md", "info");
    },
  });

  pi.registerCommand("agents", {
    description: "List available pi-subagents roles",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `Available subagent roles: ${SUBAGENT_ROLES.join(", ")}`,
        "info"
      );
    },
  });

  pi.registerCommand("mcp-status", {
    description: "Show configured MCP servers from .mcp.json",
    handler: async (_args, ctx) => {
      const configPath = resolve(ctx.cwd ?? process.cwd(), ".mcp.json");
      try {
        const raw = readFileSync(configPath, "utf8");
        const data = JSON.parse(raw) as {
          mcpServers?: Record<string, unknown>;
        };
        const names = Object.keys(data.mcpServers ?? {});
        ctx.ui.notify(
          names.length
            ? `MCP servers: ${names.join(", ")}`
            : "No MCP servers configured",
          "info"
        );
      } catch {
        ctx.ui.notify("Could not read .mcp.json", "warning");
      }
    },
  });
}
