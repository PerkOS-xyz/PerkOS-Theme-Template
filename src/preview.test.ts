import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("./preview.ts", import.meta.url));
const colors = {
  background: "#101010", surface: "#202020", text: "#FFFFFF", primary: "#B0C0FF",
  secondary: "#FFE0FF", success: "#00FF00", warning: "#FFFF00", danger: "#FF8484",
};
const theme = { version: 2, name: "Night <&>", scheme: "dark", colors };
const image = {
  mime: "image/svg+xml",
  base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/></svg>').toString("base64"),
};
let directory: string;

beforeEach(() => {
  const proof = resolve(".perkos/proof");
  mkdirSync(proof, { recursive: true });
  directory = mkdtempSync(join(proof, "preview-"));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function preview(value: unknown) {
  const input = join(directory, "sample.perkos-theme.json");
  writeFileSync(input, JSON.stringify(value));
  return spawnSync(process.execPath, [script, input], { cwd: directory, encoding: "utf8" });
}

function readPreview() {
  return readFileSync(join(directory, "preview", "sample.html"), "utf8");
}

it("writes an offline page with every themed role and all preview sections", () => {
  const result = preview({
    ...theme,
    colors: { ...colors, bar: "#303030", gradient: ["#123456", "#456789", "#789ABC"] },
    logo: image,
    sparky: image,
    networkHeader: {
      name: "Example <Network>", logo: image, notices: ["Brand & trademark notice", "<img src=x>"],
      source: "https://example.test/brand", terms: "https://example.test/terms", reviewedAt: "2026-11-23",
    },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(join("preview", "sample.html"));
  const html = readPreview();
  for (const [role, color] of Object.entries({ ...colors, bar: "#303030" })) {
    expect(html).toContain(`--${role}: ${color};`);
    expect(html).toContain(`var(--${role})`);
  }
  expect(html).toContain("color-scheme: dark");
  expect(html).toContain("--gradient: linear-gradient(90deg, #123456, #456789, #789ABC)");
  expect(html).toContain("var(--gradient)");
  expect(html.match(/class="column"/g)).toHaveLength(4);
  expect(html.match(/class="card"/g)).toHaveLength(4);
  expect(html.match(/class="chip /g)).toHaveLength(4);
  expect(html.match(/<button /g)).toHaveLength(2);
  expect(html).toContain('<progress value="65"');
  expect(html).toContain('class="bubble person primary"');
  expect(html).toContain('class="bubble agent"');
  expect(html).toContain('<header class="bar">');
  expect(html).toContain('aria-label="Network header"');
  expect(html).toContain("Night &lt;&amp;&gt;");
  expect(html).toContain("Example &lt;Network&gt;");
  expect(html).toContain("<li>Brand &amp; trademark notice</li>");
  expect(html).toContain("<li>&lt;img src=x&gt;</li>");
  expect(html.match(/<img /g)).toHaveLength(3);
  expect(html.split(`src="data:${image.mime};base64,${image.base64}"`)).toHaveLength(4);
  expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  expect(html).not.toMatch(/https?:\/\/|<script|<link/);
});

it("uses default bar and gradient values and omits missing branding", () => {
  const result = preview({ ...theme, scheme: "light" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const html = readPreview();
  expect(html).toContain("color-scheme: light");
  expect(html).toContain(`--bar: ${colors.surface};`);
  expect(html).toContain(`--gradient: linear-gradient(90deg, ${colors.primary}, ${colors.primary})`);
  expect(html).not.toMatch(/<aside|<img/);
});

it("rejects an unsafe theme image before writing output", () => {
  const result = preview({
    ...theme,
    logo: { ...image, base64: Buffer.from('<svg viewBox="0 0 32 32"><script/></svg>').toString("base64") },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("/logo: SVG element <script>");
  expect(existsSync(join(directory, "preview"))).toBe(false);
});
