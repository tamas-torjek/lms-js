import { Chat, LMStudioClient } from "@lmstudio/sdk";
import { systemPrompt } from "./system-prompt.js";
import { exec } from "child_process";
import { userPrompt } from "./user-prompt.js";

const DEFAULT_MODEL = "qwen3-30b-a3b-thinking-2507-hi-mlx";

type ParsedArgs = {
  modelName: string;
  commitHash?: string;
};

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node script.js [modelName] [--model=MODEL_NAME] [--commit=HASH]

Examples:
  node script.js                          # uses default model, staged diff
  node script.js qwen3-7b                # custom model, staged diff
  node script.js --model=qwen3-7b --commit=abc123
`);
    process.exit(0);
  }

  let modelName = DEFAULT_MODEL;
  let commitHash: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--model=")) {
      modelName = arg.split("=")[1] || DEFAULT_MODEL;
    } else if (arg.startsWith("--commit=")) {
      commitHash = arg.split("=")[1];
    } else if (!arg.startsWith("-") && modelName === DEFAULT_MODEL) {
      modelName = arg;
    }
  }

  return { modelName, commitHash };
}

const { modelName, commitHash } = parseArgs();
const client = new LMStudioClient();

getDiff(modelName);

function getDiff(modelName: string): void {
  const diffCommand =
    `git --no-pager diff --no-color --no-ext-diff --minimal` +
    (commitHash ? ` ${commitHash}^ ${commitHash}` : " --cached");

  exec(diffCommand, async (error, stdout, stderr): Promise<void> => {
    if (error) {
      console.error(`Execution error: ${error}`);
      return;
    }

    if (stderr) {
      console.error(`Execution error: ${stderr}`);
      return;
    }

    await generate(stdout, modelName);
  });
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
