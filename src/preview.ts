import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Image } from "./images.ts";
import { parseTheme, readTheme, type Theme } from "./validate.ts";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function imageTag(image: Image, className: string): string {
  return `<img class="${className}" src="data:${image.mime};base64,${image.base64}" alt="">`;
}

function foreground(fill: string): string {
  const luminance = [0.2126, 0.7152, 0.0722].reduce((total, weight, index) => {
    const start = 1 + index * 2;
    const channel = Number.parseInt(fill.slice(start, start + 2), 16) / 255;
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + weight * linear;
  }, 0);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}

const cards = [
  { column: "To do", title: "Collect launch assets", chip: "Planned", role: "secondary" },
  { column: "In progress", title: "Draft release notes", chip: "In progress", role: "warning", progress: 65 },
  { column: "Review", title: "Verify brand notices", chip: "Blocked", role: "danger" },
  { column: "Done", title: "Choose theme colors", chip: "Complete", role: "success" },
];

function render(theme: Theme): string {
  const { colors, networkHeader } = theme;
  const name = escapeHtml(theme.name);
  const gradient = colors.gradient ?? [colors.primary, colors.primary];
  const roles = { ...colors, bar: colors.bar ?? colors.surface, gradient: `linear-gradient(90deg, ${gradient.join(", ")})` };
  const fills = ["primary", "secondary", "success", "warning", "danger"] as const;
  const variables = [
    ...Object.entries(roles).map(([role, value]) => `--${role}: ${value};`),
    ...fills.map(role => `--on-${role}: ${foreground(roles[role])};`),
  ].join("\n      ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} · Theme preview</title>
  <style>
    :root {
      color-scheme: ${theme.scheme};
      ${variables}
      --border: color-mix(in srgb, var(--surface), var(--text) 25%);
      --strong-border: color-mix(in srgb, var(--surface), var(--text) 40%);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: 1rem/1.5 system-ui, sans-serif; background: var(--background); color: var(--text); }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 1.25rem; }
    h2 { font-size: 1.4rem; }
    h3 { font-size: 1rem; }
    .bar, .network { background: var(--bar); padding: 1rem clamp(1rem, 4vw, 3rem); }
    .network { border-bottom: 1px solid var(--border); }
    .identity { display: flex; align-items: center; gap: 1rem; overflow-wrap: anywhere; }
    .logo { width: auto; height: auto; max-width: 7rem; max-height: 2rem; }
    .notices { padding-left: 1.25rem; margin: .5rem 0 0; overflow-wrap: anywhere; }
    .gradient { height: .25rem; background: var(--gradient); }
    main { max-width: 74rem; margin: auto; padding: clamp(1rem, 4vw, 3rem); display: grid; gap: 2rem; }
    .section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; margin-bottom: .75rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    button, .chip { border-radius: .5rem; padding: .35rem .65rem; }
    button { border: 1px solid transparent; font: inherit; font-weight: 600; }
    button:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
    ${fills.map(role => `.${role} { background: var(--${role}); color: var(--on-${role}); }`).join("\n    ")}
    .board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; }
    .column, .chat { background: var(--surface); border: 1px solid var(--border); border-radius: .75rem; padding: .75rem; }
    .card { border: 1px solid var(--strong-border); border-radius: .5rem; padding: .75rem; margin-top: .65rem; display: grid; gap: .6rem; }
    .chip { justify-self: start; font-size: .8rem; font-weight: 600; }
    progress { appearance: none; width: 100%; height: .65rem; border: 1px solid var(--strong-border); border-radius: 1rem; overflow: hidden; background: var(--background); color: var(--primary); }
    progress::-webkit-progress-bar { background: var(--background); }
    progress::-webkit-progress-value { background: var(--primary); }
    progress::-moz-progress-bar { background: var(--primary); }
    .chat { display: grid; gap: .75rem; }
    .bubble { border-radius: .65rem; padding: .65rem .85rem; max-width: 90%; }
    .person { justify-self: end; }
    .agent { justify-self: start; background: var(--background); border: 1px solid var(--border); }
    .avatar { width: 1.5rem; height: 1.5rem; object-fit: contain; }
    @media (max-width: 48rem) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 27rem) { .board { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  ${networkHeader ? `<aside class="network" aria-label="Network header">
    <div class="identity">${imageTag(networkHeader.logo, "logo")}<strong>${escapeHtml(networkHeader.name)}</strong></div>
    ${networkHeader.notices.length ? `<ul class="notices">${networkHeader.notices.map(notice => `<li>${escapeHtml(notice)}</li>`).join("")}</ul>` : ""}
  </aside>` : ""}
  <header class="bar"><div class="identity">${theme.logo ? imageTag(theme.logo, "logo") : ""}<h1>${name}</h1></div></header>
  <div class="gradient" aria-hidden="true"></div>
  <main>
    <section aria-labelledby="board-title">
      <div class="section-heading">
        <h2 id="board-title">Board</h2>
        <div class="actions"><button type="button" class="secondary">Filter</button><button type="button" class="primary">New card</button></div>
      </div>
      <div class="board">
        ${cards.map(({ column, title, chip, role, progress }) => `<section class="column">
          <h3>${column}</h3>
          <article class="card">
            <p>${title}</p><span class="chip ${role}">${chip}</span>
            ${progress ? `<progress value="${progress}" max="100" aria-label="${title} progress">${progress}%</progress>` : ""}
          </article>
        </section>`).join("\n        ")}
      </div>
    </section>
    <section aria-labelledby="chat-title">
      <div class="section-heading"><h2 id="chat-title">Chat</h2></div>
      <div class="chat">
        <div class="bubble person primary"><strong>You</strong><p>What’s left before launch?</p></div>
        <div class="bubble agent">
          <div class="identity">${theme.sparky ? imageTag(theme.sparky, "avatar") : ""}<strong>Sparky</strong></div>
          <p>Finish the release notes and verify the brand notices.</p>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function main(): void {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length) {
    console.error("Usage: npm run preview <file>");
    process.exitCode = 1;
    return;
  }

  try {
    const result = parseTheme(readTheme(input));
    if ("issues" in result) {
      for (const issue of result.issues) console.error(`${input}: ${issue}`);
      process.exitCode = 1;
      return;
    }

    const name = basename(input, ".perkos-theme.json") || "theme";
    const output = join("preview", `${name}.html`);
    mkdirSync("preview", { recursive: true });
    writeFileSync(output, render(result.theme));
    console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
