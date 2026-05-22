import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const APPEND = `
# Clarifying Questions

When you are uncertain about the user's intent, use the \`ask_user_question\` tool to ask structured clarifying questions **before** starting work. Do not guess or make assumptions when a short question would prevent wasted effort or a wrong direction.

## When to use \`ask_user_question\`

Use it when:
- The request is ambiguous and there are 2–4 meaningfully different ways to interpret it
- Multiple valid approaches exist with real trade-offs the user should choose between
- A key piece of information is missing (target file, scope, behaviour) and it cannot be inferred from context
- You are about to make a destructive or hard-to-reverse change and the intent is unclear

Do **not** use it for:
- Trivial decisions you can reasonably infer from context
- Confirming every small detail — ask once, ask well

## How to ask well

- Keep questions focused: 1–3 questions max per dialog, each with 2–4 clear options
- Label options with 1–5 words; put the trade-off or explanation in \`description\`
- Use \`multiSelect: true\` only when the user genuinely needs to pick several things
- Use \`preview\` to show a short code snippet or ASCII diagram when it helps the user understand the difference between options
- End question text with \`?\`
`.trim();

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + APPEND,
    };
  });
}
