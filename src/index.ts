import { Chat, LMStudioClient } from "@lmstudio/sdk";
import { systemPrompt } from "./system-prompt.js";
import { exec } from "child_process";
import { userPrompt } from "./user-prompt.js";

const DEFAULT_MODEL = "qwen3-30b-a3b-thinking-2507-hi-mlx";

function parseModelArg(): string {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node script.js [modelName] [--model=MODEL_NAME]

Examples:
  node script.js                          # uses default model
  node script.js qwen3-30b-a3b-thinking-2507-hi-mlx
  node script.js --model=your-model-name
`);

    process.exit(0);
  }

  // Check for --model=foo
  const modelFlag = argv.find((a) => a.startsWith("--model="));
  if (modelFlag) {
    return modelFlag.split("=")[1] || DEFAULT_MODEL;
  }

  // Positional first argument if it doesn't look like a flag
  if (argv[0] && !argv[0].startsWith("-")) {
    return argv[0];
  }

  return DEFAULT_MODEL;
}

const modelName = parseModelArg();
const client = new LMStudioClient();

getDiff(modelName);

function getDiff(modelName: string): void {
  exec(
    "git --no-pager diff --no-color --no-ext-diff --cached --minimal",
    async (error, stdout, stderr): Promise<void> => {
      if (error) {
        console.error(`Execution error: ${error}`);
        return;
      }

      if (stderr) {
        console.error(`Execution error: ${stderr}`);
        return;
      }

      await generate(stdout, modelName);
    },
  );
}

async function generate(diff: string, modelName: string): Promise<void> {
  const model = await client.llm.model(modelName, {
    verbose: false,
    config: {
      contextLength: 16384,
      gpu: {
        ratio: 1,
      },
    },
  });

  if (!diff.length) {
    console.info("No changes detected");
    return;
  }

  const chat = Chat.from([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt.replace(`{git_diff}`, diff) },
  ]);

  const result = await model.respond(chat, {
    maxTokens: false,
    temperature: 0.25,
    topKSampling: 20,
    topPSampling: 0.8,
    minPSampling: 0.05,
  });

  process.stdout.write(result.nonReasoningContent);
}
