import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PLAN_TOOLS = ["read", "bash", "grep", "find", "ls", "mcp"];
const PROVIDER = "github-copilot";
const PLAN_MODEL = "claude-opus-4-7";
const EXEC_MODEL = "claude-sonnet-4-6";

const PLAN_INSTRUCTIONS = `[OPUSPLAN: PLAN PHASE]
Running on Opus 4.7 for planning. You have read-only tools — no edit/write.
Read the relevant code, propose a numbered plan, surface risks and unknowns.
The user will choose: execute (switches to Sonnet 4.6), refine, or cancel.`;

type CurrentModel = NonNullable<ExtensionContext["model"]>;

interface Snapshot {
  model: CurrentModel | undefined;
  tools: string[];
}

export default function opusplan(pi: ExtensionAPI) {
  let active = false;
  let snapshot: Snapshot | undefined;

  function setStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus(
      "opusplan",
      active ? ctx.ui.theme.fg("accent", "⏸ opusplan: planning") : undefined,
    );
  }

  pi.registerCommand("opusplan", {
    description: "Plan with Opus 4.7, then implement with Sonnet 4.6",
    handler: async (args, ctx) => {
      if (active) {
        ctx.ui.notify("opusplan: already in plan phase. Finish or cancel first.", "info");
        return;
      }
      const opus = ctx.modelRegistry.find(PROVIDER, PLAN_MODEL);
      if (!opus) {
        ctx.ui.notify(`opusplan: ${PROVIDER}/${PLAN_MODEL} not in model registry`, "error");
        return;
      }
      snapshot = { model: ctx.model, tools: pi.getActiveTools() };
      const ok = await pi.setModel(opus);
      if (!ok) {
        ctx.ui.notify(`opusplan: no API key for ${PROVIDER}/${PLAN_MODEL}`, "error");
        snapshot = undefined;
        return;
      }
      pi.setActiveTools(PLAN_TOOLS);
      active = true;
      setStatus(ctx);
      ctx.ui.notify("opusplan: switched to Opus 4.7 for planning", "info");
      if (args?.trim()) pi.sendUserMessage(args.trim());
    },
  });

  pi.on("before_agent_start", async () => {
    if (!active) return;
    return {
      message: {
        customType: "opusplan-context",
        content: PLAN_INSTRUCTIONS,
        display: false,
      },
    };
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!active || !ctx.hasUI) return;

    const choice = await ctx.ui.select("Opusplan — what next?", [
      "Execute the plan (switch to Sonnet 4.6)",
      "Refine the plan (stay on Opus 4.7)",
      "Cancel opusplan",
    ]);

    if (choice?.startsWith("Execute")) {
      const sonnet = ctx.modelRegistry.find(PROVIDER, EXEC_MODEL);
      if (sonnet) {
        await pi.setModel(sonnet);
      } else {
        ctx.ui.notify(`opusplan: ${EXEC_MODEL} not found — staying on Opus`, "warning");
      }
      pi.setActiveTools(snapshot?.tools ?? ["read", "bash", "edit", "write"]);
      active = false;
      snapshot = undefined;
      setStatus(ctx);
      ctx.ui.notify("opusplan: switched to Sonnet 4.6 for implementation", "info");
      pi.sendMessage(
        { customType: "opusplan-execute", content: "Execute the plan above. Make the agreed changes.", display: true },
        { triggerTurn: true },
      );
    } else if (choice?.startsWith("Refine")) {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
    } else if (choice?.startsWith("Cancel")) {
      if (snapshot?.model) await pi.setModel(snapshot.model);
      pi.setActiveTools(snapshot?.tools ?? ["read", "bash", "edit", "write"]);
      active = false;
      snapshot = undefined;
      setStatus(ctx);
      ctx.ui.notify("opusplan: cancelled, previous model and tools restored", "info");
    }
  });
}
