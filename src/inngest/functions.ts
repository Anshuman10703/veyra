import { gemini, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: [{ event: "test/hello.world" }] },
  async ({ event }) => {
    const codeAgent = createAgent({
      name: "code-agent",

      system: `
        You are an expert Next.js developer.
        Write readable, maintainable code.
        Follow SOLID and DRY principles.
        Use meaningful variable names.
        Prefer TypeScript and reusable React components.
      `,

      model: gemini({
        model: "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY,
      }),
    });

    const { output } = await codeAgent.run(
      `Write the following snippet: ${event.data.value}`,
    );

    return { output };
  },
);
