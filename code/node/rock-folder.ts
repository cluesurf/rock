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
 * The `.rock/` folder convention.
 *
 *     global:  ~/.rock/
 *     project: ./.rock/
 *
 * Walks upward from a cwd to find the nearest project
 * `.rock/`, merges with `~/.rock/` defaults, returns
 * the resolved configuration.
 */

export interface RockFolderPaths {
  globalRoot: string
  projectRoot: string | null
}

export function findRockFolders(startCwd: string): RockFolderPaths {
  return {
    globalRoot: join(homedir(), '.rock'),
    projectRoot: findProjectRockFolder(startCwd),
  }
}

/**
 * Walk up from `cwd` looking for a directory containing
 * `.rock/`. Returns the `.rock/` path, or null if none.
 */
export function findProjectRockFolder(startCwd: string): string | null {
  let current = resolve(startCwd)
  while (true) {
    const candidate = join(current, '.rock')
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export interface LoadedRockConfig {
  workspace: WorkspaceDefinition | null
  commands: Record<string, CommandDefinition>
  plugins: Plugin[]
  sidebarComponent: string | null
  layout: LayoutNode | null
  rootDirectory: string
}

/**
 * Load a project `.rock/` folder. Each file is optional.
 * Returns the merged configuration with paths resolved
 * absolutely.
 *
 * Files probed:
 *   term.ts        the WorkspaceDefinition (required for `rock open`)
 *   commands.ts    Record<string, CommandDefinition>
 *   plugins.ts     Plugin[]
 *   sidebar.tsx    React component path (resolved absolute)
 *   layout.ts      LayoutNode AST
 */
export async function loadRockFolder(
  termDirectory: string,
): Promise<LoadedRockConfig> {
  const result: LoadedRockConfig = {
    workspace: null,
    commands: {},
    plugins: [],
    sidebarComponent: null,
    layout: null,
    rootDirectory: termDirectory,
  }

  const termModule = await loadOptional<{
    default: WorkspaceDefinition
  }>(join(termDirectory, 'term.ts'))
  if (termModule?.default) {
    result.workspace = termModule.default
  }

  const commandsModule = await loadOptional<{
    default: Record<string, CommandDefinition>
  }>(join(termDirectory, 'commands.ts'))
  if (commandsModule?.default) {
    result.commands = commandsModule.default
  }

  const pluginsModule = await loadOptional<{ default: Plugin[] }>(
    join(termDirectory, 'plugins.ts'),
  )
  if (pluginsModule?.default) {
    result.plugins = pluginsModule.default
  }

  const sidebarPath = join(termDirectory, 'sidebar.tsx')
  if (existsSync(sidebarPath)) {
    result.sidebarComponent = sidebarPath
  }

  const layoutModule = await loadOptional<{ default: LayoutNode }>(
    join(termDirectory, 'layout.ts'),
  )
  if (layoutModule?.default) {
    result.layout = layoutModule.default
  }

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
export function mergeRockConfigs(
  global: LoadedRockConfig | null,
  project: LoadedRockConfig,
): LoadedRockConfig {
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
