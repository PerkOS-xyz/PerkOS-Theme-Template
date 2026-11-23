# PerkOS Theme Template

Start here to build a theme for PerkOS Runtime. Press **Use this template** on GitHub, edit `theme.perkos-theme.json`, run the checks, and release it with a tag. PerkOS Runtime and the PerkOS catalogue read the released file.

## What a theme is

One `.perkos-theme.json` file (format version 2): a name, a dark or light scheme, eight colors, and optional images for the logo, Sparky's avatar and a network header with its notices. See [FORMAT.md](FORMAT.md).

## Checks

Every theme must pass the same checks PerkOS Runtime runs before it saves or publishes a theme: text contrast of at least 4.5:1 on every background it sits on, 3:1 for essential borders and focus, image limits, and safe SVG.

Run `npm run preview theme.perkos-theme.json` and open `preview/theme.html` to see the board, chat, and branding in a browser. The output uses the input filename stem and works offline.

## Logos and notices

Only use marks you have the rights to. Keep each brand's proportions, colors and clear space, and add its required notices to `NOTICE.md`. When rights are not verified, publish the colors with the network header off.

## Releases

Tag a release as `vX.Y.Z`. Desks and the catalogue pin a theme by its tag.
