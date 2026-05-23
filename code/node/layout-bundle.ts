/**
 * JIT bundler for user `.rock/layout.tsx` (and other user
 * .tsx files). Runs in the Electron main process.
 *
 * Why bundle: the user writes JSX + TypeScript that
 * imports `@cluesurf/rock/face`, `react`, etc. We need to
 * turn that into runnable browser JS without re-bundling
 * `react` or the face library (the renderer already has
 * those, and React breaks if loaded twice).
 *
 * How: esbuild with a plugin that replaces those imports
 * with reads from `globalThis.__rock__`. The renderer
 * populates that object before mounting (see
 * `code/face/external-bridge.ts`). The compiled bundle is
 * served via the `rock://` protocol (see
 * `code/desktop/rock-protocol.ts`).
 */

import { build, type Plugin } from 'esbuild'
import { existsSync } from 'node:fs'

/**
 * Module specifiers that must be sourced from the
 * renderer's existing bundle, not re-bundled.
 */
const SHARED_MODULES: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@cluesurf/rock',
  '@cluesurf/rock/face',
  '@cluesurf/rock/base',
  '@cluesurf/rock/desktop',
  '@xterm/xterm',
  '@xterm/addon-fit',
  '@xterm/addon-search',
  '@xterm/addon-web-links',
]

/**
 * For each shared module, the named exports the renderer
 * exposes on `globalThis.__rock__[moduleId]`. ESM requires
 * static `export const X = ...` so we enumerate.
 *
 * Keep these in sync with what
 * `code/face/external-bridge.ts` populates.
 */
const SHARED_EXPORTS: Record<string, readonly string[]> = {
  react: [
    'createElement',
    'cloneElement',
    'createContext',
    'createRef',
    'forwardRef',
    'memo',
    'lazy',
    'Suspense',
    'Fragment',
    'StrictMode',
    'Component',
    'PureComponent',
    'Children',
    'useState',
    'useEffect',
    'useLayoutEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useReducer',
    'useContext',
    'useImperativeHandle',
    'useDeferredValue',
    'useTransition',
    'useId',
    'useSyncExternalStore',
    'useInsertionEffect',
    'startTransition',
    'version',
  ],
  'react/jsx-runtime': ['jsx', 'jsxs', 'Fragment'],
  'react/jsx-dev-runtime': ['jsxDEV', 'Fragment'],
  'react-dom': ['flushSync', 'createPortal', 'version'],
  'react-dom/client': ['createRoot', 'hydrateRoot'],
  '@cluesurf/rock': ['workspace', 'defineWorkspace'],
  '@cluesurf/rock/face': [
    'Slab',
    'Nest',
    'Dock',
    'Tree',
    'Branch',
    'Leaf',
    'Bar',
    'Cell',
    'Palette',
    'Keys',
    'Sheet',
    'Toast',
    'mount',
    'useTerminalApi',
    'useTerminalStore',
    'TerminalApiProvider',
    'TerminalEvents',
    'usePalette',
    'useKeys',
    'defaultKeys',
    'toast',
    'useAutoToasts',
    'useRockTheme',
  ],
  '@cluesurf/rock/base': [],
  '@cluesurf/rock/desktop': [],
  '@xterm/xterm': ['Terminal'],
  '@xterm/addon-fit': ['FitAddon'],
  '@xterm/addon-search': ['SearchAddon'],
  '@xterm/addon-web-links': ['WebLinksAddon'],
}

function makeSharedPlugin(): Plugin {
  return {
    name: 'rock-shared',
    setup(b) {
      const filter = new RegExp(
        `^(${SHARED_MODULES.map(m => m.replace(/[.+*?^${}()|[\]\\\/]/g, '\\$&')).join('|')})$`,
      )
      b.onResolve({ filter }, args => ({
        path: args.path,
        namespace: 'rock-shared',
      }))
      b.onLoad({ filter: /.*/, namespace: 'rock-shared' }, args => {
        const moduleId = args.path
        const named = SHARED_EXPORTS[moduleId] ?? []
        const safe = JSON.stringify(moduleId)
        const namedRe = named
          .map(n => `export const ${n} = m[${JSON.stringify(n)}]`)
          .join('\n')
        const contents = `
const m = globalThis.__rock__ && globalThis.__rock__[${safe}]
if (!m) throw new Error('rock: shared module not provided by renderer: ' + ${safe})
export default m.default ?? m
${namedRe}
`.trim()
        return { contents, loader: 'js' }
      })
    },
  }
}

export interface BundleResult {
  /** The bundled ESM source. */
  code: string
  /** Absolute paths of every file in the bundle (for HMR). */
  watchFiles: string[]
}

/**
 * Bundle a user .tsx entry point into ESM that runs in the
 * renderer with the externals provided via
 * `globalThis.__rock__`.
 *
 * Returns null if the entry file doesn't exist (the caller
 * decides whether that's an error or a fall-back).
 */
export async function bundleUserModule(
  entryFile: string,
): Promise<BundleResult | null> {
  if (!existsSync(entryFile)) return null

  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'esnext',
    platform: 'browser',
    jsx: 'automatic',
    plugins: [makeSharedPlugin()],
    metafile: true,
    logLevel: 'silent',
    sourcemap: 'inline',
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        jsx: 'react-jsx',
        module: 'esnext',
        target: 'esnext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
      },
    }),
  })

  const out = result.outputFiles?.[0]
  if (!out) throw new Error('esbuild produced no output')

  const watchFiles = Object.keys(result.metafile?.inputs ?? {}).map(
    relativePath => relativePath,
  )

  return { code: out.text, watchFiles }
}
