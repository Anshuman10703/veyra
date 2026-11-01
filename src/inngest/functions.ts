import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";

import {
  openai,
  createAgent,
  createTool,
  createNetwork,
} from "@inngest/agent-kit";

import { PROMPT } from "@/prompt";

import { inngest } from "./client";
import { getSandbox, lastAssistantTextMessageContent } from "./utils";

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    triggers: [{ event: "test/hello.world" }],
  },
  async ({ event, step }) => {
    // 1. Create E2B sandbox
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("veyra-test");

      return sandbox.sandboxId;
    });

    // 2. Initialize coding agent
    const codeAgent = createAgent({
      name: "code-agent",
      description: "An expert coding agent",

      system: PROMPT,

      // Groq through OpenAI-compatible API
      model: openai({
        model: "openai/gpt-oss-120b",
        apiKey: process.env.GROQ_API_KEY,
        baseUrl: "https://api.groq.com/openai/v1",
      }),

      tools: [
        // 3. Terminal tool
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",

          parameters: z.object({
            command: z.string(),
          }),

          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = {
                stdout: "",
                stderr: "",
              };

              try {
                const sandbox = await getSandbox(sandboxId);

                const result = await sandbox.commands.run(command, {
                  onStdout: (data: string) => {
                    buffers.stdout += data;
                  },

                  onStderr: (data: string) => {
                    buffers.stderr += data;
                  },
                });

                return result.stdout;
              } catch (error) {
                console.error(
                  `Command failed: ${error}\n` +
                    `stdout: ${buffers.stdout}\n` +
                    `stderr: ${buffers.stderr}`,
                );

                return (
                  `Command failed: ${error}\n` +
                  `stdout: ${buffers.stdout}\n` +
                  `stderr: ${buffers.stderr}`
                );
              }
            });
          },
        }),

        // 4. Create or update files
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",

          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              }),
            ),
          }),

          handler: async ({ files }, { step, network }) => {
            const newFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const updatedFiles = network.state.data.files || {};

                  const sandbox = await getSandbox(sandboxId);

                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);

                    updatedFiles[file.path] = file.content;
                  }

                  return updatedFiles;
                } catch (error) {
                  return "Error: " + error;
                }
              },
            );

            if (typeof newFiles === "object" && newFiles !== null) {
              network.state.data.files = newFiles;
            }
          },
        }),

        // 5. Read files
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox",

          parameters: z.object({
            files: z.array(z.string()),
          }),

          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);

                const contents = [];

                for (const file of files) {
                  const content = await sandbox.files.read(file);

                  contents.push({
                    path: file,
                    content,
                  });
                }

                return JSON.stringify(contents);
              } catch (error) {
                return "Error: " + error;
              }
            });
          },
        }),
      ],

      // 6. Agent lifecycle
      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (
            lastAssistantMessageText &&
            network &&
            lastAssistantMessageText.includes("<task_summary>")
          ) {
            network.state.data.summary = lastAssistantMessageText;
          }

          return result;
        },
      },
    });

    // 7. Create agent network
    const network = createNetwork({
      name: "coding-agent-network",

      agents: [codeAgent],

      maxIter: 15,

      router: async ({ network }) => {
        const summary = network.state.data.summary;

        if (summary) {
          return;
        }

        return codeAgent;
      },
    });

    // 8. Run agent
    const result = await network.run(event.data.value);

    // 9. Get preview URL
    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);

      const host = sandbox.getHost(3000);

      return `https://${host}`;
    });

    // 10. Return result
    return {
      url: sandboxUrl,
      title: "Veyra",
      files: result.state.data.files,
      summary: result.state.data.summary,
    };
  },
);
