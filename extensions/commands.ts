import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

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
    description: "Show configured MCP servers",
    handler: async (_args, ctx) => {
      const candidates = [
        join(homedir(), ".config", "mcp", "mcp.json"),
        join(homedir(), ".pi", "agent", "mcp.json"),
        resolve(ctx.cwd ?? process.cwd(), ".mcp.json"),
        resolve(ctx.cwd ?? process.cwd(), ".pi", "mcp.json"),
      ];
      const configPath = candidates.find(existsSync);
      if (!configPath) {
        ctx.ui.notify("No MCP config found", "warning");
        return;
      }
      try {
        const data = JSON.parse(readFileSync(configPath, "utf8")) as {
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
        ctx.ui.notify("Could not read MCP config", "warning");
      }
    },
  });
}
