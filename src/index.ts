import fs from "fs";
import { Chat, LMStudioClient } from "@lmstudio/sdk";
import { exec, spawn } from "child_process";
import { bumpVersion } from "./bump-version.js";

const systemPrompt = fs.readFileSync(new URL("./system-prompt.md", import.meta.url), "utf8");
const userPrompt = fs.readFileSync(new URL("./user-prompt.md", import.meta.url), "utf8");

type ParsedArgs = {
  modelName: string;
  commitHash?: string;
};

const DEFAULT_MODEL = "qwen/qwen3-8b"; // smaller, still ok: qwen3-4b-instruct-2507-mlx;
let DRY_RUN = false;
let BUMP_VERSION = false;
let BUMP_ONLY = false;
let GET_DIFF = false;
let FULL_DIFF = false;

async function parseArgs(): Promise<ParsedArgs> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node script.js [modelName] [--model=MODEL_NAME] [--commit=HASH] [--dry-run] [--bump] [--bump-only] [--get-diff] [--full-diff]

Examples:
  script.js # uses default model, staged diff
  script.js qwen3-7b # custom model, staged diff
  script.js --model=qwen3-7b --commit=abc123 # custom model, specific commit
  script.js --bump # bump version as well
  script.js --bump-only # bump version only, no commit
  script.js --get-diff # show diff only
  script.js --full-diff # get full diff (not minimal)
`);
    process.exit(0);
  }

  DRY_RUN = argv.includes("--dry-run");
  BUMP_ONLY = argv.includes("--bump-only");
  GET_DIFF = argv.includes("--get-diff");
  FULL_DIFF = argv.includes("--full-diff");

  if (BUMP_ONLY || argv.includes("--bump")) {
    BUMP_VERSION = true;

    if (BUMP_ONLY || DRY_RUN) {
      await bumpVersion(DRY_RUN);
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
    } else if (!GET_DIFF && !arg.startsWith("-") && modelName === DEFAULT_MODEL) {
      modelName = arg;
    }
  }

  return { modelName, commitHash };
}

const { modelName, commitHash } = await parseArgs();
const client = new LMStudioClient();

getDiff(modelName);

function getDiff(modelName: string): void {
  const color = GET_DIFF ? "" : " --no-color";
  const minimal = !FULL_DIFF ? " --minimal" : "";
  const hash = commitHash ? ` ${commitHash}^ ${commitHash}` : " --cached";

  const diffCommand = `git --no-pager diff${color}${minimal} --no-ext-diff${hash}`;

  exec(diffCommand, async (error, stdout, stderr): Promise<void> => {
    if (error) {
      console.error(`Execution error: ${error}`);
      return;
    }

    if (stderr) {
      console.error(`Execution error: ${stderr}`);
      return;
    }

    if (GET_DIFF) {
      console.log(`\n${stdout}`);
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
      contextLength: 65536,
      gpu: {
        ratio: 1,
      },
    },
  });

  console.log(`💬 Generating commit message...`);

  let userPromptWithReadme = userPrompt.replace(`{git_diff}`, diff);
  const readme = await fs.promises.readFile("README.md", "utf8").catch(() => "");

  if (readme.length) {
    userPromptWithReadme = `Here is the description of the project which you will create the git commit message for:\n\n${readme}\n\n---\n\n${userPromptWithReadme}`;
  }

  const chat = Chat.from([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPromptWithReadme.replace(`{git_diff}`, diff) },
  ]);

  const result = await model.respond(chat, {
    maxTokens: false,
    temperature: 0.6,
    topKSampling: 20,
    topPSampling: 0.95,
    minPSampling: 0,
    repeatPenalty: 1,
  });

  const message = result.nonReasoningContent.trim();

  if (DRY_RUN) {
    console.log(message);
    return;
  }

  if (BUMP_VERSION) {
    await bumpVersion(DRY_RUN);
  }

  const git = spawn("git", ["commit", "-e", "-m", message], {
    stdio: "inherit",
  });

  git.on("exit", (code) => {
    process.exit(code);
  });
}
