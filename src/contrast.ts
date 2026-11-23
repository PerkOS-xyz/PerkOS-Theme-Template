export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  bar?: string;
  gradient?: string[];
}

const textMinimum = 4.5;
const boundaryMinimum = 3;
const accentRoles = ["primary", "secondary", "success", "warning", "danger"] as const;

function channels(color: string): number[] {
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
}

function mix(from: string, to: string, percent: number): string {
  const target = channels(to);
  return "#" + channels(from).map((channel, index) =>
    Math.round((channel * (100 - percent) + target[index] * percent) / 100)
      .toString(16).padStart(2, "0"),
  ).join("").toUpperCase();
}

function luminance(color: string): number {
  const [red, green, blue] = channels(color).map(channel => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function strongestPassingMix(
  base: string, tint: string, percent: number, passes: (color: string) => boolean,
): string {
  for (let amount = percent; amount > 0; amount--) {
    const color = mix(base, tint, amount);
    if (passes(color)) return color;
  }
  return base;
}

function textBackgrounds(colors: ThemeColors, hover: string, bar: string) {
  return {
    background: colors.background,
    surface: colors.surface,
    hover,
    bar,
    "neutral button": hover,
    "incoming chat bubble": colors.surface,
    popover: colors.surface,
    "code panel": colors.background,
  };
}

export function deriveColors(colors: ThemeColors) {
  const { text, surface, primary } = colors;
  const hover = strongestPassingMix(surface, text, 8, color => contrastRatio(text, color) >= textMinimum);
  const bar = colors.bar ?? surface;
  const backgrounds = Object.values(textBackgrounds(colors, hover, bar));
  return {
    hover,
    border: mix(surface, text, 25),
    essentialBorder: mix(surface, text, 40),
    mutedText: strongestPassingMix(text, surface, 25, color =>
      backgrounds.every(background => contrastRatio(color, background) >= textMinimum)),
    textOnPrimary: contrastRatio("#000000", primary) >= contrastRatio("#FFFFFF", primary)
      ? "#000000" : "#FFFFFF",
    bar,
    gradient: `linear-gradient(90deg, ${(colors.gradient ?? [primary, primary]).join(", ")})`,
  };
}

export function deriveAccentText(accent: string, text: string, background: string): string {
  return strongestPassingMix(text, accent, 100, color => contrastRatio(color, background) >= textMinimum);
}

export function checkContrast(colors: ThemeColors): string[] {
  const derived = deriveColors(colors);
  const issues: string[] = [];
  function check(role: string, color: string, context: string, background: string, minimum: number) {
    const ratio = contrastRatio(color, background);
    if (ratio < minimum) {
      issues.push(`${role} (${color}) on ${context} (${background}): ${ratio.toFixed(3)}:1 (requires ${minimum}:1)`);
    }
  }

  for (const [context, background] of Object.entries(textBackgrounds(colors, derived.hover, derived.bar))) {
    check("text", colors.text, context, background, textMinimum);
    check("muted text", derived.mutedText, context, background, textMinimum);
    for (const role of accentRoles) {
      const adjusted = deriveAccentText(colors[role], colors.text, background);
      check(`${role} text`, adjusted, context, background, textMinimum);
    }
  }

  for (const context of ["primary button", "outgoing chat bubble"]) {
    check("text on primary", derived.textOnPrimary, context, colors.primary, textMinimum);
  }

  // Essential panel outlines sit on the page background.
  check("essential border", derived.essentialBorder, "background", colors.background, boundaryMinimum);
  for (const [context, background] of Object.entries({
    background: colors.background, surface: colors.surface, hover: derived.hover, bar: derived.bar,
  })) {
    check("focus", colors.primary, context, background, boundaryMinimum);
  }
  return issues;
}
