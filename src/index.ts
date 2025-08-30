import fs from "fs";
import { Chat, LMStudioClient } from "@lmstudio/sdk";
import { systemPrompt } from "./system-prompt.js";
import { exec, spawn } from "child_process";
import { userPrompt } from "./user-prompt.js";
import { bumpVersion } from "./bump-version.js";

type ParsedArgs = {
  modelName: string;
  commitHash?: string;
};

const DEFAULT_MODEL = "qwen/qwen3-8b"; // smaller, still ok: qwen3-4b-instruct-2507-mlx;
let DRY_RUN = false;
let BUMP_VERSION = false;

async function parseArgs(): Promise<ParsedArgs> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node script.js [modelName] [--model=MODEL_NAME] [--commit=HASH]

Examples:
  node script.js          # uses default model, staged diff
  node script.js qwen3-7b # custom model, staged diff
  node script.js --model=qwen3-7b --commit=abc123
`);
    process.exit(0);
  }

  DRY_RUN = argv.includes("--dry-run");

  if (argv.includes("--bump")) {
    BUMP_VERSION = true;

    if (DRY_RUN) {
      await bumpVersion(true);
      process.exit(0);
    }
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

const { modelName, commitHash } = await parseArgs();
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
  if (!diff.length) {
    console.info("❎ No changes detected");
    return;
  }

  console.log(`🤖 Loading ${modelName}...`);

  const model = await client.llm.model(modelName, {
    verbose: false,
    config: {
      contextLength: 16384,
      gpu: {
        ratio: 1,
      },
    },
  });

  console.log(`💬 Generating commit message...`);

  let userPromptWithReadme = userPrompt.replace(`{git_diff}`, diff);
  const readme = await fs.promises
    .readFile("README.md", "utf8")
    .catch(() => "");

  if (readme.length) {
    userPromptWithReadme = `Here is the description of the project which you will create the git commit message for:\n\n${readme}\n\n---\n\n${userPromptWithReadme}`;
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

  const message = result.nonReasoningContent.trim();

  if (DRY_RUN) {
    console.log(message);
    return;
  }

  if (BUMP_VERSION) {
    await bumpVersion(true);
  }

  const git = spawn("git", ["commit", "-e", "-m", message], {
    stdio: "inherit",
  });

  git.on("exit", (code) => {
    process.exit(code);
  });
}
