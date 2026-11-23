import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, deriveAccentText, deriveColors } from "./contrast.ts";
import { validateTheme } from "./validate.ts";

const theme = {
  version: 2,
  name: "Night",
  scheme: "dark",
  colors: {
    background: "#101010", surface: "#202020", text: "#FFFFFF", primary: "#B0C0FF",
    secondary: "#FFE0FF", success: "#00FF00", warning: "#FFFF00", danger: "#FF8484",
  },
};

const lightTheme = {
  ...theme,
  name: "Day",
  scheme: "light",
  colors: {
    background: "#FFFFFF", surface: "#F0F0F0", text: "#000000", primary: "#333366",
    secondary: "#B9B9B9", success: "#197829", warning: "#A85D00", danger: "#AC2828",
  },
};

const png = {
  mime: "image/png",
  base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZ8AAAAASUVORK5CYII=",
};
const jpeg = {
  mime: "image/jpeg",
  base64: "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z",
};
const webp = {
  mime: "image/webp",
  base64: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
};

function extendedWebp(header: Buffer, chunks: Buffer) {
  const riff = Buffer.from(webp.base64, "base64").subarray(0, 12);
  const bytes = Buffer.concat([riff, header, chunks]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return { ...webp, base64: bytes.toString("base64") };
}

function svg(markup: string) {
  return { mime: "image/svg+xml", base64: Buffer.from(markup).toString("base64") };
}

function check(value: unknown): string[] {
  return validateTheme(Buffer.from(JSON.stringify(value)));
}

describe("theme contrast", () => {
  it.each([theme, lightTheme])("accepts accessible $scheme themes", value => {
    expect(check(value)).toEqual([]);
  });

  it.each([theme, lightTheme])("reports all failures for a flat $scheme theme", value => {
    const color = value.colors.background;
    const colors = {
      background: color, surface: color, text: color, primary: color, secondary: color,
      success: color, warning: color, danger: color,
    };
    const contexts = ["background", "surface", "hover", "bar", "neutral button",
      "incoming chat bubble", "popover", "code panel"];
    const roles = ["text", "muted text", "primary text", "secondary text",
      "success text", "warning text", "danger text"];
    expect(check({ ...value, colors })).toEqual([
      ...contexts.flatMap(context => roles.map(role =>
        `${role} (${color}) on ${context} (${color}): 1.000:1 (requires 4.5:1)`)),
      `essential border (${color}) on background (${color}): 1.000:1 (requires 3:1)`,
      ...["background", "surface", "hover", "bar"].map(context =>
        `focus (${color}) on ${context} (${color}): 1.000:1 (requires 3:1)`),
    ]);
  });

  it("derives rounded colors and respects bar and gradient overrides", () => {
    expect(deriveColors(theme.colors)).toEqual({
      hover: "#323232", border: "#585858", essentialBorder: "#797979",
      mutedText: "#C7C7C7", textOnPrimary: "#000000", bar: "#202020",
      gradient: "linear-gradient(90deg, #B0C0FF, #B0C0FF)",
    });
    expect(deriveColors({
      ...lightTheme.colors, bar: "#EEEEEE", gradient: ["#FFFFFF", "#CCCCCC", "#000000"],
    })).toMatchObject({
      bar: "#EEEEEE", textOnPrimary: "#FFFFFF",
      gradient: "linear-gradient(90deg, #FFFFFF, #CCCCCC, #000000)",
    });
  });

  it.each([
    [theme, "#707070", "#767676", "#777777", "#FEFEFE", "#FDFDFD"],
    [lightTheme, "#7F7F7F", "#757575", "#747474", "#010101", "#030303"],
  ] as const)("walks hover, muted text and accent text to a passing step for $scheme", (
    value, surface, hover, nextHover, mutedText, nextMuted,
  ) => {
    const { text } = value.colors;
    const derived = deriveColors({ ...value.colors, surface });
    expect(derived.hover).toBe(hover);
    expect(contrastRatio(text, derived.hover)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, nextHover)).toBeLessThan(4.5);
    expect(derived.mutedText).toBe(mutedText);
    expect(contrastRatio(nextMuted, derived.hover)).toBeLessThan(4.5);

    const background = text === "#FFFFFF" ? "#000000" : "#FFFFFF";
    expect(deriveAccentText(background, text, background)).toBe("#757575");
    expect(deriveAccentText(text, text, background)).toBe(text);
  });
});

describe("theme validation", () => {
  it("accepts required fields and the optional v2 fields", () => {
    expect(check(theme)).toEqual([]);
    expect(check({ ...theme, logo: jpeg, sparky: webp })).toEqual([]);
    expect(check({
      ...theme,
      name: "A".repeat(80),
      colors: { ...theme.colors, bar: "#303030", gradient: ["#102030", "#405060", "#708090"] },
      logo: png,
      sparky: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="#ABC"/></svg>'),
      networkHeader: {
        name: "Network",
        logo: png,
        notices: ["Network mark used with permission."],
        source: "https://example.com/brand",
        terms: "https://example.com/terms",
        reviewedAt: "2026-01-15",
      },
    })).toEqual([]);
  });

  it("reports invalid versions, names, colors, gradients, and network metadata by field", () => {
    expect(check({
      ...theme,
      version: 1,
      name: "Night\n",
      scheme: "auto",
      colors: { ...theme.colors, warning: "#aabbcc", gradient: ["#123456"] },
      networkHeader: { notices: "Missing fields" },
      typo: true,
    })).toEqual(expect.arrayContaining([
      "/version must be 2",
      "/name must be nonempty and trimmed",
      "/scheme must be one of dark, light",
      "/colors/warning must be an uppercase six-digit hex color (such as #AABBCC)",
      "/colors/gradient must NOT have fewer than 2 items",
      "/networkHeader is missing reviewedAt",
      "/networkHeader/notices must be array",
      "/ has unknown field typo",
    ]));
    expect(check({ ...theme, name: "A".repeat(81) })[0]).toContain("/name");
    expect(check({ ...theme, colors: {} })).toContain("/colors is missing primary");
  });

  it("checks JSON, UTF-8, and both sides of the file byte limit", () => {
    const json = JSON.stringify(theme);
    expect(validateTheme(Buffer.from("{"))[0]).toContain("invalid UTF-8 JSON");
    expect(validateTheme(Buffer.from([0xff]))[0]).toContain("invalid UTF-8 JSON");
    expect(validateTheme(Buffer.from(json.padEnd(544 * 1024)))).toEqual([]);
    expect(validateTheme(Buffer.from(json.padEnd(544 * 1024 + 1)))).toEqual(["theme file exceeds 544 KiB"]);
  });

  it("checks image encoding, decoded size, MIME type, dimensions, and completeness", () => {
    expect(check({ ...theme, logo: { ...png, base64: "ab==" } })).toEqual(["/logo: invalid base64 encoding"]);
    const large = Buffer.alloc(128 * 1024 + 1).toString("base64");
    expect(check({ ...theme, logo: { ...png, base64: large } })).toEqual(["/logo: decoded image exceeds 128 KiB"]);
    expect(check({ ...theme, logo: { ...png, mime: "image/jpeg" } })[0]).toContain("image bytes do not match");
    const bytes = Buffer.from(png.base64, "base64");
    expect(check({ ...theme, logo: { ...png, base64: bytes.subarray(0, -12).toString("base64") } })[0])
      .toContain("incomplete or malformed");
    bytes.writeUInt32BE(1025, 16);
    expect(check({ ...theme, logo: { ...png, base64: bytes.toString("base64") } })[0]).toContain("1024 × 1024");
  });

  it("rejects APNG animation chunks", () => {
    const bytes = Buffer.from(png.base64, "base64");
    const animationChunk = Buffer.from("000000086163544c000000020000000000000000", "hex");
    const base64 = Buffer.concat([bytes.subarray(0, 33), animationChunk, bytes.subarray(33)]).toString("base64");
    expect(check({ ...theme, logo: { ...png, base64 } })).toEqual(["/logo: animated images are forbidden"]);
  });

  it("rejects concatenated JPEGs and the WebP animation flag", () => {
    const jpg = Buffer.from(jpeg.base64, "base64");
    const concatenated = Buffer.concat([jpg, jpg]).toString("base64");
    expect(check({ ...theme, logo: { ...jpeg, base64: concatenated } }))
      .toEqual(["/logo: JPEG must contain one complete image"]);
    const extendedHeader = Buffer.from("565038580a00000002000000000000000000", "hex");
    const frame = Buffer.from(webp.base64, "base64").subarray(12);
    expect(check({ ...theme, logo: extendedWebp(extendedHeader, frame) }))
      .toEqual(["/logo: animated images are forbidden"]);
  });

  it.each(["ANIM", "ANMF"])("rejects WebP %s chunks even with the animation flag clear", kind => {
    const header = Buffer.from("565038580a00000000000000000000000000", "hex");
    const chunk = Buffer.alloc(8);
    chunk.write(kind);
    const frame = Buffer.from(webp.base64, "base64").subarray(12);
    expect(check({ ...theme, logo: extendedWebp(header, Buffer.concat([chunk, frame])) }))
      .toEqual(["/logo: animated images are forbidden"]);
  });

  it("checks encoded WebP frame dimensions as well as the extended canvas", () => {
    const header = Buffer.from("565038580a00000000000000000000000000", "hex");
    const frame = Buffer.from(webp.base64, "base64").subarray(12);
    expect(check({ ...theme, logo: extendedWebp(header, frame) })).toEqual([]);
    frame.writeUInt16LE(1025, 14);
    expect(check({ ...theme, logo: extendedWebp(header, frame) })[0]).toContain("1024 × 1024");
    const lossless = Buffer.from("5650384c050000002f0004000000", "hex");
    expect(check({ ...theme, logo: extendedWebp(header, lossless) })[0]).toContain("1024 × 1024");
  });

  it.each([
    ['<svg viewBox="0 0 32 32"><script/></svg>', "element <script>"],
    ['<svg viewBox="0 0 32 32"><rect onload="alert(1)"/></svg>', "attribute onload"],
    ['<svg viewBox="0 0 32 32"><path href="#shape"/></svg>', "attribute href"],
    ['<svg viewBox="0 0 32 32"><path xlink:href="#shape"/></svg>', "attribute xlink:href"],
    ['<svg viewBox="0 0 32 32"><path fill="url(#paint)"/></svg>', "attribute fill"],
    ['<svg viewBox="0 0 32 32"><image href="https://example.com/image.png"/></svg>', "element <image>"],
    ['<svg viewBox="0 0 32 32"><foreignObject/></svg>', "element <foreignObject>"],
    ['<svg viewBox="0 0 32 32"><animate/></svg>', "element <animate>"],
    ['<svg viewBox="0 0 32 32"><rect style="fill:red"/></svg>', "attribute style"],
    ['<svg viewBox="0 0 32 32"><title>&amp;</title></svg>', "entity references"],
    ['<!DOCTYPE svg><svg viewBox="0 0 32 32"/>', "doctypes"],
    ['<svg viewBox="0 0 1e999 32"/>', "finite viewBox"],
    ['<svg viewBox="0 0 32 32" width="1025"/>', "1024 × 1024"],
    ['<svg viewBox="0 0 32 32"><rect></svg>', "unexpected close tag"],
  ])("rejects unsafe, malformed or oversized SVG %s", (markup, detail) => {
    expect(check({ ...theme, sparky: svg(markup) })[0]).toContain(detail);
  });
});

it("checks every matching file, including nested hidden folders, and reports failures", () => {
  const proofDirectory = resolve(".perkos/proof");
  mkdirSync(proofDirectory, { recursive: true });
  const directory = mkdtempSync(join(proofDirectory, "cli-"));
  try {
    mkdirSync(join(directory, ".themes"));
    writeFileSync(join(directory, ".themes", "valid.perkos-theme.json"), JSON.stringify(theme));
    writeFileSync(join(directory, "contrast.perkos-theme.json"), JSON.stringify({
      ...theme, colors: { ...theme.colors, bar: "#FFFFFF" },
    }));
    const script = fileURLToPath(new URL("./validate.ts", import.meta.url));
    const contrastOnly = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
    expect(contrastOnly.status).toBe(1);
    writeFileSync(join(directory, "invalid.perkos-theme.json"), JSON.stringify({ ...theme, version: 1 }));
    writeFileSync(join(directory, "unsafe.perkos-theme.json"), JSON.stringify({
      ...theme, logo: svg('<svg viewBox="0 0 32 32"><path href="#shape"/></svg>'),
    }));
    writeFileSync(join(directory, "ignored.json"), "{");
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(join(".themes", "valid.perkos-theme.json") + ": valid");
    expect(result.stderr.trim().split("\n")).toEqual([
      "contrast.perkos-theme.json: text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: muted text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: primary text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: secondary text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: success text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: warning text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: danger text (#FFFFFF) on bar (#FFFFFF): 1.000:1 (requires 4.5:1)",
      "contrast.perkos-theme.json: focus (#B0C0FF) on bar (#FFFFFF): 1.775:1 (requires 3:1)",
      "invalid.perkos-theme.json: /version must be 2",
      "unsafe.perkos-theme.json: /logo: SVG attribute href has an unsupported name or value",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
