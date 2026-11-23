import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import theme from "../theme.perkos-theme.json" with { type: "json" };

const release = fileURLToPath(new URL("./release.ts", import.meta.url));
const validator = fileURLToPath(new URL("./validate.ts", import.meta.url));
let directory: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
}

function commitTheme(value: object): void {
  writeFileSync(join(directory, "theme.perkos-theme.json"), JSON.stringify(value));
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false",
    "commit", "-qm", "Prepare release");
}

function run(tag: string) {
  return spawnSync(process.execPath, [release, tag], { cwd: directory, encoding: "utf8" });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "perkos-release-"));
  git("init", "-q");
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    scripts: { check: 'node "' + validator + '"' },
  }));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("tags the checked commit when the release version matches", () => {
  commitTheme(theme);
  const result = run(`v${theme.releaseVersion}`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("theme.perkos-theme.json: valid");
  expect(git("rev-parse", `v${theme.releaseVersion}`)).toBe(git("rev-parse", "HEAD"));
});

it.each([
  { tag: "v1.0", releaseVersion: "1.0.0", message: "Usage:" },
  { tag: "v2.0.0", releaseVersion: "1.0.0", message: "releaseVersion must be 2.0.0" },
  { tag: "v1.0.0", releaseVersion: undefined, message: "releaseVersion must be 1.0.0" },
])("rejects tag $tag for release version $releaseVersion", ({ tag, releaseVersion, message }) => {
  commitTheme({ ...theme, releaseVersion });
  const result = run(tag);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
  expect(git("tag", "--list")).toBe("");
});

it("refuses to tag a theme that fails validation", () => {
  commitTheme({ ...theme, colors: { ...theme.colors, text: theme.colors.background } });
  const result = run(`v${theme.releaseVersion}`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("text (#1D1029) on background");
  expect(git("tag", "--list")).toBe("");
});

it("refuses to tag when the working tree has changes", () => {
  commitTheme(theme);
  writeFileSync(join(directory, "theme.perkos-theme.json"), "{}");
  const result = run(`v${theme.releaseVersion}`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Commit your changes before releasing.");
  expect(git("tag", "--list")).toBe("");
});
