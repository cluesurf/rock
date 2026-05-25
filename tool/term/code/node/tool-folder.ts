import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  CommandDefinition,
  WorkspaceDefinition,
} from '@/base/define'
import type { LayoutNode } from '@/base/types'
import type { Plugin } from '@/base/plugin'

/**
 * The `.tool/term/` folder convention.
 *
 *     global:  ~/.tool/term/
 *     project: ./.tool/term/
 *
 * Walks upward from a cwd to find the nearest project
 * `.tool/term/`, merges with `~/.tool/term/` defaults, returns
 * the resolved configuration.
 */

export interface ToolFolderPaths {
  globalRoot: string
  projectRoot: string | null
}

export function findToolFolders(startCwd: string): ToolFolderPaths {
  return {
    globalRoot: join(homedir(), '.tool', 'term'),
    projectRoot: findProjectToolFolder(startCwd),
  }
}

/**
 * Walk up from `cwd` looking for a directory containing
 * `.tool/term/`. Returns the `.tool/term/` path, or null if none.
 */
export function findProjectToolFolder(startCwd: string): string | null {
  let current = resolve(startCwd)
  while (true) {
    const candidate = join(current, '.tool', 'term')
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export interface LoadedToolConfig {
  workspace: WorkspaceDefinition | null
  commands: Record<string, CommandDefinition>
  plugins: Plugin[]
  sidebarComponent: string | null
  layout: LayoutNode | null
  rootDirectory: string
}

/**
 * Load a project `.tool/term/` folder. Each file is optional.
 * Returns the merged configuration with paths resolved
 * absolutely.
 *
 * Files probed:
 *   workspace.ts   the WorkspaceDefinition (required for `term open`)
 *   commands.ts    Record<string, CommandDefinition>
 *   plugins.ts     Plugin[]
 *   sidebar.tsx    React component path (resolved absolute,
 *                  JIT-bundled by code/node/layout-bundle.ts)
 *   layout.tsx     React layout component (JIT-bundled by
 *                  code/node/layout-bundle.ts)
 */
export async function loadToolFolder(
  toolDirectory: string,
): Promise<LoadedToolConfig> {
  const result: LoadedToolConfig = {
    workspace: null,
    commands: {},
    plugins: [],
    sidebarComponent: null,
    layout: null,
    rootDirectory: toolDirectory,
  }

  const workspaceModule = await loadOptional<{
    default: WorkspaceDefinition
  }>(join(toolDirectory, 'workspace.ts'))
  if (workspaceModule?.default) {
    result.workspace = workspaceModule.default
  }

  const commandsModule = await loadOptional<{
    default: Record<string, CommandDefinition>
  }>(join(toolDirectory, 'commands.ts'))
  if (commandsModule?.default) {
    result.commands = commandsModule.default
  }

  const pluginsModule = await loadOptional<{ default: Plugin[] }>(
    join(toolDirectory, 'plugins.ts'),
  )
  if (pluginsModule?.default) {
    result.plugins = pluginsModule.default
  }

  const sidebarPath = join(toolDirectory, 'sidebar.tsx')
  if (existsSync(sidebarPath)) {
    result.sidebarComponent = sidebarPath
  }

  // layout.tsx is JIT-bundled separately by callers via
  // code/node/layout-bundle.ts. Not loaded here as data.

  return result
}

async function loadOptional<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null
  const url = pathToFileURL(filePath).href
  // Dynamic import lets consumers' bundler / tsx loader handle
  // TypeScript transformation. The consuming app is responsible
  // for ensuring its node loader supports .ts files.
  return (await import(url)) as T
}

/**
 * Merge project config on top of global defaults. Project
 * values win.
 */
export function mergeToolConfigs(
  global: LoadedToolConfig | null,
  project: LoadedToolConfig,
): LoadedToolConfig {
  if (!global) return project
  return {
    workspace: project.workspace ?? global.workspace,
    commands: { ...global.commands, ...project.commands },
    plugins: [...global.plugins, ...project.plugins],
    sidebarComponent:
      project.sidebarComponent ?? global.sidebarComponent,
    layout: project.layout ?? global.layout,
    rootDirectory: project.rootDirectory,
  }
}
