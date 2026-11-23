import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { Ajv, type ErrorObject } from "ajv";
import { checkContrast, type ThemeColors } from "./contrast.ts";
import { checkImage, type Image } from "./images.ts";
import schema from "../schema/theme-v2.schema.json" with { type: "json" };

const maxFileBytes = 544 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const checkSchema = new Ajv({ allErrors: true, ownProperties: true }).compile<{
  colors: ThemeColors;
  logo?: Image;
  sparky?: Image;
  networkHeader?: { logo: Image };
}>(schema);

function schemaMessage(error: ErrorObject): string {
  const path = error.instancePath || "/";
  switch (error.keyword) {
    case "required": return path + " is missing " + error.params.missingProperty;
    case "additionalProperties": return path + " has unknown field " + error.params.additionalProperty;
    case "const": return path + " must be " + JSON.stringify(error.params.allowedValue);
    case "enum": return path + " must be one of " + error.params.allowedValues.join(", ");
    case "pattern":
      if (path.startsWith("/colors/")) return path + " must be an uppercase six-digit hex color (such as #AABBCC)";
      if (path === "/name") return path + " must be nonempty and trimmed";
      if (path.endsWith("/base64")) return path + " must contain standard base64";
      return path + " must contain non-whitespace text";
    default: return path + " " + error.message;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function validateTheme(bytes: Uint8Array): string[] {
  if (bytes.byteLength > maxFileBytes) return ["theme file exceeds 544 KiB"];
  let theme: unknown;
  try {
    theme = JSON.parse(decoder.decode(bytes));
  } catch (error) {
    return ["invalid UTF-8 JSON: " + message(error)];
  }
  if (!checkSchema(theme)) return (checkSchema.errors ?? []).map(schemaMessage);
  const issues = checkContrast(theme.colors);
  const images = { "/logo": theme.logo, "/sparky": theme.sparky, "/networkHeader/logo": theme.networkHeader?.logo };
  for (const [path, image] of Object.entries(images)) {
    if (!image) continue;
    try {
      checkImage(image);
    } catch (error) {
      issues.push(path + ": " + message(error));
    }
  }
  return issues;
}

function* themePaths(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && ![".git", "node_modules", ".perkos"].includes(entry.name)) {
      yield* themePaths(path);
    } else if (entry.isFile() && entry.name.endsWith(".perkos-theme.json")) {
      yield path;
    }
  }
}

function readTheme(path: string): Buffer {
  const file = openSync(path, "r");
  try {
    const bytes = Buffer.alloc(maxFileBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(file, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    return bytes.subarray(0, offset);
  } finally {
    closeSync(file);
  }
}

function main(): void {
  const paths = [...themePaths(".")].sort();
  for (const path of paths) {
    try {
      const issues = validateTheme(readTheme(path));
      if (issues.length === 0) {
        console.log(path + ": valid");
        continue;
      }
      for (const issue of issues) console.error(path + ": " + issue);
    } catch (error) {
      console.error(path + ": " + message(error));
    }
    process.exitCode = 1;
  }
  if (paths.length === 0) console.log("No *.perkos-theme.json files found.");
}

if (import.meta.main) main();
