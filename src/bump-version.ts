import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";

type BumpType = "patch" | "minor" | "major";

function bumpSemver(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
  }
}

export async function bumpVersion(dryRun: boolean): Promise<void> {
  const packagePath = path.resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

  const { bumpType } = await inquirer.prompt<{ bumpType: BumpType | "none" }>([
    {
      type: "list",
      name: "bumpType",
      message: `Current version is ${pkg.version}. Choose bump type:`,
      choices: [
        { name: "Patch", value: "patch" },
        { name: "Minor", value: "minor" },
        { name: "Major", value: "major" },
        { name: "None", value: "none" },
      ],
      loop: true,
    },
  ]);

  if (bumpType === "none") {
    return;
  }

  const newVersion = bumpSemver(pkg.version, bumpType);

  if (dryRun) {
    console.log(`✅ Bumped version to ${newVersion}`);
    return;
  }

  pkg.version = newVersion;

  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  // Stage the package.json file
  execSync("git add package.json");

  console.log(`✅ Bumped version to ${newVersion} and staged package.json`);
}
