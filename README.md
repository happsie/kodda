# kodda

Personal [pi](https://pi.dev) agent harness — custom footer, safety rails, opusplan, and clarifying questions prompt.

Bundles [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter), [pi-subagents](https://github.com/nicobailon/pi-subagents), and [context-mode](https://github.com/mksglu/context-mode).

## Install

```sh
pi install git:github.com/happsie/kodda
```

## MCP servers (one-time)

Copy the example config and fill in your values:

```sh
cp ~/.pi/agent/git/github.com/happsie/kodda/.mcp.example.json ~/.pi/agent/mcp.json
```

## Included extensions

| Extension | What it does |
|---|---|
| `footer.ts` | Status bar: cwd · branch [↑↓] · diff stats · context usage · model |
| `safety.ts` | Blocks dangerous commands (`rm -rf /`, force-push to main, etc.) |
| `commands.ts` | `/scratch`, `/mcp-status`, `/agents`, `/opusplan` |
| `opusplan.ts` | Plan with Opus 4.7, execute with Sonnet 4.6 |
| `system.ts` | Injects clarifying-questions instructions into every session |

## Recommended global settings

Add to `~/.pi/agent/settings.json`:

```json
{
  "mcp": { "toolPrefix": "short", "autoAuth": true, "idleTimeout": 10 },
  "subagents": { "defaultModel": "inherit", "worktreeIsolation": true }
}
```
