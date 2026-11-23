import { execFileSync } from "node:child_process";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function release(args: string[]): void {
  const [tag] = args;
  if (args.length !== 1 || !/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![\s\S])/.test(tag)) {
    throw new Error("Usage: node src/release.ts vX.Y.Z");
  }
  if (git("rev-parse", "--show-prefix").trim()) {
    throw new Error("Run the release script from the repository root.");
  }
  if (git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("Commit your changes before releasing.");
  }

  const commit = git("rev-parse", "HEAD").trim();
  const theme = JSON.parse(git("show", `${commit}:theme.perkos-theme.json`));
  if (theme?.releaseVersion !== tag.slice(1)) {
    throw new Error(`theme.perkos-theme.json releaseVersion must be ${tag.slice(1)} for tag ${tag}.`);
  }

  execFileSync("npm", ["run", "check"], { stdio: "inherit" });
  git("tag", tag, commit);
  console.log(`Created ${tag}.`);
}

try {
  release(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
