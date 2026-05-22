import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DANGER_PATTERNS: RegExp[] = [
  /rm\s+-[a-z]*r[a-z]*f\s+\/(?:\s|$)/,
  /rm\s+-[a-z]*r[a-z]*f\s+~(?:\/|\s|$)/,
  /git\s+push\s+.*--force(?:-with-lease)?.*\s+(?:main|master)(?:\s|$)/,
  /git\s+push\s+.*\s+(?:main|master).*--force(?:-with-lease)?(?:\s|$)/,
  /chmod\s+-R\s+777/,
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd: string = (event.input as { command?: string })?.command ?? "";
    const matched = DANGER_PATTERNS.find((p) => p.test(cmd));
    if (!matched) return;

    const preview = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
    const ok = await ctx.ui.confirm(
      "Dangerous command detected",
      `Allow: \`${preview}\`?`
    );
    if (!ok) return { block: true, reason: "Blocked by safety gate" };
  });
}
