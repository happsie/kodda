import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PLAN_TOOLS = ["read", "bash", "grep", "find", "ls", "mcp"];

const PLAN_INSTRUCTIONS = `[PLAN: PLAN PHASE]
Running in planning mode. You have read-only tools — no edit/write.
Read the relevant code, propose a numbered plan, surface risks and unknowns.
The user will choose: execute (restores full tools), refine, or cancel.`;

export default function plan(pi: ExtensionAPI) {
  let active = false;
  let savedTools: string[] | undefined;

  function setStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus(
      "plan",
      active ? ctx.ui.theme.fg("accent", "⏸ plan: planning") : undefined,
    );
  }

  pi.registerCommand("plan", {
    description: "Plan with current model (read-only), then implement with full tools",
    handler: async (args, ctx) => {
      if (active) {
        ctx.ui.notify("plan: already in plan phase. Finish or cancel first.", "info");
        return;
      }
      savedTools = pi.getActiveTools();
      pi.setActiveTools(PLAN_TOOLS);
      active = true;
      setStatus(ctx);
      ctx.ui.notify("plan: planning mode active (read-only tools)", "info");
      if (args?.trim()) pi.sendUserMessage(args.trim());
    },
  });

  pi.on("before_agent_start", async () => {
    if (!active) return;
    return {
      message: {
        customType: "plan-context",
        content: PLAN_INSTRUCTIONS,
        display: false,
      },
    };
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!active || !ctx.hasUI) return;

    const choice = await ctx.ui.select("Plan — what next?", [
      "Execute the plan",
      "Refine the plan",
      "Cancel plan",
    ]);

    if (choice?.startsWith("Execute")) {
      pi.setActiveTools(savedTools ?? ["read", "bash", "edit", "write"]);
      active = false;
      savedTools = undefined;
      setStatus(ctx);
      ctx.ui.notify("plan: executing — full tools restored", "info");
      pi.sendMessage(
        { customType: "plan-execute", content: "Execute the plan above. Make the agreed changes.", display: true },
        { triggerTurn: true },
      );
    } else if (choice?.startsWith("Refine")) {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
    } else if (choice?.startsWith("Cancel")) {
      pi.setActiveTools(savedTools ?? ["read", "bash", "edit", "write"]);
      active = false;
      savedTools = undefined;
      setStatus(ctx);
      ctx.ui.notify("plan: cancelled, tools restored", "info");
    }
  });
}
