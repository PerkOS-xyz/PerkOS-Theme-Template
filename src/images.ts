import { imageSize } from "image-size";
import { SaxesParser } from "saxes";

export type Image = { mime: string; base64: string };

const maxImageBytes = 128 * 1024;
const maxDimension = 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

const svgNamespace = "http://www.w3.org/2000/svg";
const svgElements = new Set("svg g path rect circle ellipse line polyline polygon title desc".split(" "));
const svgAttributes = new Set([
  "xmlns", "viewBox", "width", "height", "preserveAspectRatio", "transform",
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "points",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "stroke-dashoffset", "opacity", "vector-effect",
]);
const svgNumber = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?$/i;
const svgPaint = /^(?:[a-z]+|#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.%+\s,/-]+\))$/i;

function checkDimensions(width: number, height: number): void {
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= maxDimension)) {
    throw new Error("image dimensions must be positive and at most 1024 × 1024");
  }
}

function checkSvg(bytes: Buffer): void {
  const xml = decoder.decode(bytes);
  if (xml.includes("&")) throw new Error("SVG entity references are forbidden");
  const parser = new SaxesParser();
  let hasRoot = false;
  parser.on("doctype", () => { throw new Error("SVG doctypes are forbidden"); });
  parser.on("processinginstruction", () => { throw new Error("SVG processing instructions are forbidden"); });
  parser.on("opentag", ({ name, attributes }) => {
    if (!svgElements.has(name) || (hasRoot && name === "svg")) {
      throw new Error("SVG element <" + name + "> is forbidden");
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (!svgAttributes.has(key) ||
          (key === "xmlns" && value !== svgNamespace) ||
          ((key === "fill" || key === "stroke") && !svgPaint.test(value.trim()))) {
        throw new Error("SVG attribute " + key + " has an unsupported name or value");
      }
    }
    if (hasRoot) return;
    if (name !== "svg") throw new Error("image must have an SVG root");
    hasRoot = true;
    const viewBox = attributes.viewBox?.trim().split(/[\t\n\r ,]+/) ?? [];
    const [x, y, width, height] = viewBox.map(Number);
    if (viewBox.length !== 4 || !viewBox.every(value => svgNumber.test(value)) ||
        ![x, y, x + width, y + height].every(Number.isFinite)) {
      throw new Error("SVG requires a finite viewBox with four numbers");
    }
    checkDimensions(width, height);
    // Percent dimensions are relative to the embed, whose intrinsic bounds come from the viewBox.
    for (const key of ["width", "height"]) {
      const value = attributes[key]?.trim();
      if (value === undefined) continue;
      const number = value.replace(/(?:px|%)$/, "");
      if (!svgNumber.test(number)) throw new Error("SVG " + key + " must use pixels or a percentage");
      const pixels = value.endsWith("%") ? Number(number) * (key === "width" ? width : height) / 100 : Number(number);
      checkDimensions(pixels, pixels);
    }
  });
  parser.write(xml).close();
}

function checkJpeg(bytes: Buffer): void {
  if (bytes.length < 2 || bytes.readUInt16BE(0) !== 0xffd8) {
    throw new Error("image bytes do not match image/jpeg");
  }
  let offset = 2;
  let inScan = false;
  let hasScan = false;
  let hasFrame = false;
  while (offset < bytes.length) {
    if (inScan) offset = bytes.indexOf(0xff, offset);
    if (offset < 0 || bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    // Byte stuffing and restart markers belong to the current compressed scan.
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9) {
      if (hasFrame && hasScan && offset === bytes.length) return;
      break;
    }
    if (marker < 0xc0 || marker === 0xd8 || offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (hasFrame || length < 8) break;
      checkDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      hasFrame = true;
    }
    inScan = marker === 0xda;
    hasScan ||= inScan;
    offset += length;
  }
  throw new Error("JPEG must contain one complete image");
}

function checkWebpFrame(kind: string, data: Buffer): void {
  if (kind === "VP8L") {
    if (data.length < 5 || data[0] !== 0x2f) throw new Error("invalid WebP lossless frame header");
    const dimensions = data.readUInt32LE(1);
    checkDimensions(1 + (dimensions & 0x3fff), 1 + ((dimensions >>> 14) & 0x3fff));
    return;
  }
  if (data.length < 10 || data.readUIntBE(3, 3) !== 0x9d012a) {
    throw new Error("invalid WebP lossy frame header");
  }
  checkDimensions(data.readUInt16LE(6) & 0x3fff, data.readUInt16LE(8) & 0x3fff);
}

function checkRasterContainer(bytes: Buffer, mime: string): void {
  const png = mime === "image/png";
  if (png && bytes[0] !== 0x89) throw new Error("invalid PNG signature");
  if (!png && bytes.readUInt32LE(4) !== bytes.length - 8) {
    throw new Error("WebP container length does not match the image");
  }
  let hasImageData = false;
  let offset = png ? 8 : 12;
  while (offset + (png ? 12 : 8) <= bytes.length) {
    const kind = bytes.toString("latin1", offset + (png ? 4 : 0), offset + (png ? 8 : 4));
    const length = png ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
    const end = offset + length + (png ? 12 : 8 + (length % 2));
    if (end > bytes.length) break;
    const animated = png ? ["acTL", "fcTL", "fdAT"].includes(kind) :
      kind === "ANIM" || kind === "ANMF" || (kind === "VP8X" && length > 0 && (bytes[offset + 8] & 2));
    if (animated) {
      throw new Error("animated images are forbidden");
    }
    if (!png && kind === "VP8X" && (offset !== 12 || length !== 10)) {
      throw new Error("invalid WebP extended header");
    }
    if (png ? kind === "IDAT" && length > 0 : kind === "VP8 " || kind === "VP8L") {
      if (!png) {
        if (hasImageData) throw new Error("expected one WebP image");
        // The VP8X canvas can advertise different dimensions from the encoded frame.
        checkWebpFrame(kind, bytes.subarray(offset + 8, offset + 8 + length));
      }
      hasImageData = true;
    }
    if (png && kind === "IEND") {
      if (length === 0 && end === bytes.length && hasImageData) return;
      break;
    }
    offset = end;
  }
  if (png || offset !== bytes.length || !hasImageData) throw new Error("image container is incomplete or malformed");
}

export function checkImage({ mime, base64 }: Image): void {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new Error("invalid base64 encoding");
  if (bytes.length > maxImageBytes) throw new Error("decoded image exceeds 128 KiB");
  if (mime === "image/svg+xml") {
    checkSvg(bytes);
    return;
  }
  if (mime === "image/jpeg") return checkJpeg(bytes);
  const expected = mime === "image/png" ? "png" : "webp";
  const { width, height, type, images } = imageSize(bytes);
  if (type !== expected) throw new Error("image bytes do not match " + mime);
  if (images && images.length > 1) throw new Error("expected one image");
  checkDimensions(width, height);
  checkRasterContainer(bytes, mime);
}
