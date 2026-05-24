# Extending Rock

Rock is the host shell; you write everything else in
`.rock/code/`. This doc covers what you can customize and
the API surface you have access to.

## The single entry point

```
<projectRoot>/.rock/
└── code/
    └── index.tsx        Required if you customize anything
```

JIT-compiled by esbuild on every Rock launch. The default
export defines your app:

```ts
import { workspace } from '@cluesurf/rock'
import type { ComponentType } from 'react'

export default {
  workspace?: WorkspaceDefinition,
  Layout?:    ComponentType,        // optional full-screen layout
  Sidebar?:   ComponentType,        // optional sidebar
  commands?:  Record<string, CommandDefinition>,  // future use
}
```

All keys are optional. Provide only what you need to
customize — Rock fills the rest with sensible defaults.

You can split internally into any file shape:

```
.rock/code/
├── index.tsx        re-exports / glues everything together
├── workspace.ts     your workspace definition
├── layout.tsx       your Layout component
├── sidebar.tsx      your Sidebar component
└── commands/
    ├── deploy.ts
    └── logs.ts
```

The contract is just `index.tsx` exporting a default
object. Rock doesn't care about the internal structure.

## Just customize the workspace

Most common use. Define which slabs spawn at launch:

```ts
import { workspace } from '@cluesurf/rock'

export default {
  workspace: workspace({
    name: 'word-surf',
    slabs: {
      shell: {},
      web:   { cwd: './site', command: 'pnpm dev' },
      api:   { cwd: './base', command: 'pnpm dev' },
      logs:  { command: 'tail -f /var/log/word-surf.log' },
    },
    env: {                          // workspace-level env, merged into every slab
      NODE_ENV: 'development',
    },
  }),
}
```

Slab options:

| Field    | Type                       | Default                          |
| -------- | -------------------------- | -------------------------------- |
| `cwd`    | `string`                   | the workspace root               |
| `program`| `string`                   | OS default shell (zsh on macOS)  |
| `args`   | `string[]`                 | `[]`                             |
| `command`| `string`                   | undefined (just runs shell)      |
| `env`    | `Record<string, string>`   | `{}` (merged with workspace env) |

`program` = the binary to spawn. `command` = a string typed
into the spawned shell after it starts (so e.g. `command:
'pnpm dev'` runs `pnpm dev` in zsh after the prompt). Use
`command` for "run this in my shell with all my aliases /
profile"; use `program` for "spawn this binary directly".

## Custom Layout

Replace the entire renderer:

```tsx
import { Slab, Dock, Nest, TreeView, useTerminalStore } from '@cluesurf/rock/face'
import { cluesurfDark } from '@cluesurf/rock/theme/cluesurf/dark'

function MyLayout() {
  return (
    <Slab theme={cluesurfDark}>
      <Nest direction="horizontal" ratio={0.3}>
        <YourSidebar />
        <Nest direction="vertical" ratio={0.7}>
          <Dock name="web" />
          <Dock name="logs" />
        </Nest>
      </Nest>
    </Slab>
  )
}

export default {
  workspace: /* ... */,
  Layout: MyLayout,
}
```

You get every face component plus the store hooks.
Available via `@cluesurf/rock/face`:

```
// Layout primitives
Slab, Dock, Nest

// Sidebar
TreeView, Tree, Branch, Leaf

// Status / commands
Bar, Cell, Palette, Sheet, Toast

// Hooks
useTerminalStore, useTerminalApi, useRockTheme, useSlabActivity

// Keyboard
Keys, useKeys

// JIT bridge (for loading other user modules)
loadUserModule, loadUserNamespace, extendExternalBridge
```

## Custom Sidebar (only)

Keep Rock's default layout but swap just the sidebar:

```tsx
import { useTerminalStore, Dock } from '@cluesurf/rock/face'

function MySidebar() {
  const slabs = useTerminalStore(s => Object.entries(s.slabIdByName))
  return (
    <ul>
      {slabs.map(([name, id]) => (
        <li key={id}>{name}</li>
      ))}
    </ul>
  )
}

export default {
  workspace: /* ... */,
  Sidebar: MySidebar,
}
```

(Note: the default shell wires the built-in `TreeView`.
If you replace the sidebar entirely, you lose the tree
editing. You can still mount `TreeView` yourself inside
your custom Sidebar.)

## Themes

Built-in themes ship as per-package imports for tree
shaking:

```ts
import { dracula } from '@cluesurf/rock/theme/dracula'
import { cluesurfLight } from '@cluesurf/rock/theme/cluesurf/light'

<Slab theme={dracula}>
```

Available:
- `@cluesurf/rock/theme/dracula`
- `@cluesurf/rock/theme/one-dark`
- `@cluesurf/rock/theme/solarized-dark`
- `@cluesurf/rock/theme/solarized-light`
- `@cluesurf/rock/theme/nord`
- `@cluesurf/rock/theme/gruvbox-dark`
- `@cluesurf/rock/theme/monokai`
- `@cluesurf/rock/theme/tokyo-night`
- `@cluesurf/rock/theme/cluesurf/dark`
- `@cluesurf/rock/theme/cluesurf/light`

Define your own as a plain object:

```ts
import type { RockTheme } from '@cluesurf/rock/base'

export const myTheme: RockTheme = {
  name: 'My Theme',
  font: '"JetBrains Mono", monospace',
  background: '#0a0a0a',
  foreground: '#fafafa',
  accent: '#ff0080',
  red: '#ef4444',
  green: '#22c55e',
  // ... see RockTheme type for every slot
}
```

## CLI integration

The `rock` CLI talks to a running Rock.app over a Unix
socket. Use it from scripts:

```bash
rock spawn build --cwd=./packages/api
rock send build "pnpm build\n"
rock focus build
rock list             # see what's running
rock kill build
```

Useful in CI hooks, deploy scripts, and editor commands.

## What you can't customize yet

(All in `cluesurf/note/library/rock/feature-roadmap.md`.)

- `Bar` (status strip) isn't wired into the default shell
- Splits (`Cmd+D` for horizontal / `Cmd+Shift+D` for
  vertical) — not implemented
- Drag tab between windows — single window per drag-context
- Shell integration (OSC 133) for command duration —
  currently using activity heuristic
- Background opacity / window transparency
- Theme picker UI — change themes by editing
  `.rock/code/index.tsx`'s Layout
