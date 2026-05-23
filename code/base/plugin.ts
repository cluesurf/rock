import type { CommandDefinition } from './define'
import type { LayoutNode } from './types'

export type Plugin = {
  name: string
  setup(context: PluginContext): void | Promise<void>
}

export type PluginContext = {
  /** Register a React component shown in the sidebar. */
  registerSidebarPanel(input: SidebarPanelRegistration): void

  /** Register a named command runnable from CLI or palette. */
  registerCommand(name: string, command: CommandDefinition): void

  /** Register a workflow (multi-step orchestration). */
  registerWorkflow(name: string, workflow: WorkflowDefinition): void

  /** Register a custom slab content type beyond plain PTY. */
  registerSlabType(input: SlabTypeRegistration): void

  /** Inject slabs into a workspace layout at startup. */
  injectLayout(input: LayoutInjection): void

  /** Status-bar widget (rendered in the bottom strip). */
  registerStatusWidget(input: StatusWidgetRegistration): void

  /**
   * Subscribe to lifecycle events (workspace open, slab
   * spawn, command run, etc.). Returns an unsubscribe.
   */
  on(event: PluginLifecycleEvent, handler: () => void): () => void
}

export type SidebarPanelRegistration = {
  id: string
  title: string
  /** Path to a React component file (resolved from project root). */
  component: string
}

export type WorkflowDefinition = {
  description?: string
  /** Each step is a command or a sub-workflow reference. */
  steps: Array<
    | { kind: 'command'; ref: string }
    | { kind: 'workflow'; ref: string }
  >
}

export type SlabTypeRegistration = {
  type: string
  /** Path to a React component that renders this slab type. */
  component: string
}

export type LayoutInjection = {
  /** Where to inject: a tab name or 'root'. */
  target: string
  layout: LayoutNode
}

export type StatusWidgetRegistration = {
  id: string
  position: 'left' | 'center' | 'right'
  /** Path to a React component. */
  component: string
}

export type PluginLifecycleEvent =
  | 'workspace:open'
  | 'workspace:close'
  | 'slab:spawn'
  | 'slab:exit'
  | 'command:before'
  | 'command:after'
