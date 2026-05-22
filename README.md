# kodda

Personal pi agent harness with MCP and subagent support.

## Setup

```bash
npm install          # install TypeScript types for IDE support
pi install npm:pi-mcp-adapter -l
pi install npm:pi-subagents -l
pi install npm:context-mode -l
```

## Run

```bash
pi              # interactive TUI
pi -p "..."     # one-shot non-interactive
pi -c           # continue previous session
```

## Structure

```
.pi/
  extensions/
    safety.ts          # blocks dangerous bash commands
    session-context.ts # injects cwd/date/branch at session start
    commands.ts        # /scratch  /mcp-status  /agents
  settings.json        # MCP settings, subagent defaults
.mcp.json              # MCP server registry
AGENTS.md              # agent instructions (auto-loaded by pi)
```

## MCP servers

`fnx-internal-mcp` and `postgres` are pre-configured in `.mcp.json` with `lifecycle: lazy` — they connect only when the agent first calls them.

To point postgres at a different database, set `DATABASE_URI` in your environment before running `pi`.

## Extensions

Add project-specific extensions to `.pi/extensions/*.ts`. They are auto-discovered by pi at startup. Each file must export a default function `(pi: ExtensionAPI) => void`.

## Packages installed

| Package | Purpose |
|---|---|
| `pi-mcp-adapter` | ~200-token MCP proxy; lazy-loads any MCP server |
| `pi-subagents` | Delegates tasks to focused child agents |
| `context-mode` | Sandboxed tool output; FTS5 knowledge base |
