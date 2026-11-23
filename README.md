# PerkOS Theme Template

Start here to build a theme for PerkOS Runtime. PerkOS Runtime and the PerkOS catalogue read the released theme file.

## Create and preview a theme

1. On GitHub, choose **Use this template** and create a repository. Clone your copy and open its root directory.
2. With Node 22.18 or later in the Node 22 series, install the dev dependencies with `npm install --no-package-lock`.
3. Edit `theme.perkos-theme.json`, starting with the PerkOS dark example. Set the name, scheme, and colors, then add any optional images and notices.
4. Run `npm run check`. Fix each reported issue before releasing.
5. Import `theme.perkos-theme.json` in PerkOS Runtime on a test desk. Open its board and chat to preview the theme, then edit and re-import as needed.

## What a theme is

One `.perkos-theme.json` file (format version 2): a name, a dark or light scheme, eight colors, and optional images for the logo, Sparky's avatar and a network header with its notices. See [FORMAT.md](FORMAT.md).

## Checks

Every theme must pass the same checks PerkOS Runtime runs before it saves or publishes a theme: text contrast of at least 4.5:1 on every background it sits on, 3:1 for essential borders and focus, image limits, and safe SVG.

Run `npm run preview theme.perkos-theme.json` and open `preview/theme.html` to see the board, chat, and branding in a browser. The output uses the input filename stem and works offline.

## Logos and notices

Only use marks you have the rights to. Keep each brand's proportions, colors and clear space, and add its required notices to `NOTICE.md`. When rights are not verified, publish the colors with the network header off.

## Releases

Set `releaseVersion` in `theme.perkos-theme.json` to the release number, such as `1.0.0`. Keep the file format's `version` at `2`.

Run `npm run typecheck` and `npm test`, then commit your changes and run these commands from the repository root:

```sh
node src/release.ts v1.0.0
git push origin HEAD
git push origin v1.0.0
```

Use your release number in both commands that mention the tag. The script creates the local tag only when the working tree is clean, the committed theme's `releaseVersion` matches the tag, and `npm run check` passes. Desks and the catalogue pin a theme by its tag. To add release notes, publish a GitHub release using the pushed tag.
