# Claude Code themes — Term variants

JSON themes that mirror Term's `cluesurf/dark` and
`cluesurf/light` for use inside Claude Code.

## Files

| File              | Pairs with                                  |
| ----------------- | ------------------------------------------- |
| `rock-dark.json`  | `@cluesurf/term/theme/term/dark`            |
| `rock-light.json` | `@cluesurf/term/theme/term/light`           |

Same color families across both: emerald greens, rose
reds, violet accent, zinc grays.

## Install

Via the Term CLI (recommended — themes ship inside
Term.app, no manual copy):

```bash
term install theme claude
```

That copies both JSON files into `~/.claude/themes/`,
then prints how to activate in Claude.

Or manually:

```bash
cp code/theme/claude/*.json ~/.claude/themes/
```

In a Claude Code session:

```
/theme
```

Pick **Term Dark** or **Term Light**.

## Schema caveat

Claude's custom-theme JSON schema isn't publicly
documented as of this writing. The keys in these files
combine:

- **Standard terminal palette** (`background`, `foreground`,
  `cursor`, `selectionBackground`, `ansi.*`) — widely
  recognized by terminal apps
- **Common UI roles** (`primary`, `accent`, `muted`,
  `border`, `panel`, `error`, `warning`, `success`, `info`,
  `added`, `removed`) — pattern Claude likely uses
- **Diff highlighting** (`diffAddedLineBackground`, etc.)
- **Syntax tokens** (`syntax.string`, `syntax.keyword`,
  etc.) — common across editor themes

If Claude ignores some of these keys (because its actual
schema uses different names), the missing parts fall back
to the theme this one `extends` (dark or light). The
in-app `/theme` picker has an "Edit custom theme" option
to tweak directly.

## Syntax highlighting (NOT user-configurable)

Claude's syntax tokens (keyword / string / type / function
colors in code blocks) are **not configurable from user
settings as of this writing**. There is no `syntaxTheme`
key in `~/.claude/settings.json`, no override in custom
theme JSON, no slash command for it.

The syntax palette is **hardcoded per base preset**:

- `base: "dark"` → Monokai-style palette baked in
- `base: "light"` → light Monokai-style palette baked in
- `base: "dark-ansi"` → uses the terminal's ANSI 16 colors
  (= Term's ANSI palette when running inside Term.app)
- `base: "light-ansi"` → uses terminal's ANSI 16 (light bg)

**Both of our themes use `dark-ansi` / `light-ansi`** so
syntax tokens fall back to Term's ANSI palette — that's
the closest visual match for Term that's currently
possible.

What `Ctrl+T` inside `/theme` actually does:
- Toggles between **diff mode** and **regular syntax mode**
  rendering of code blocks
- Does NOT cycle syntax themes (despite what an earlier
  version of this doc claimed)

If Anthropic ships configurable syntax themes someday
(tracking https://github.com/anthropics/claude-code/issues/42189
and #48636), we'll add a recommendation here. Until then,
`dark-ansi` is the path to color consistency.

## The pink Claude mascot

The little bear in the Claude header is hardcoded into
Claude Code's binary as a brand asset. It does NOT map to
any theme token. Mascot stays Claude-pink regardless of
custom theme. Not configurable from JSON.

## Updating

These files live in the Term lib (`code/theme/claude/`)
and are bundled into Term.app at package time. To update:

1. Edit the JSON here
2. Bump the Term.app version + ship
3. Users get the update via `brew upgrade --cask cluesurf/tool/rock`
4. Re-run `term install theme claude` to overwrite their copy
