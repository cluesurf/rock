import type { ID, Slab, Workspace } from './types'

export type TerminalRequest =
  | {
      type: 'workspace:create'
      payload: {
        name: string
        root: string
      }
    }
  | {
      type: 'workspace:open'
      payload: {
        workspaceId: ID
      }
    }
  | {
      type: 'workspace:list'
      payload: Record<string, never>
    }
  | {
      type: 'slab:create'
      payload: {
        workspaceId: ID
        tabId: ID
        name?: string
        cwd?: string
        program?: string
        args?: string[]
        command?: string
        env?: Record<string, string>
        cols: number
        rows: number
      }
    }
  | {
      type: 'slab:write'
      payload: {
        slabId: ID
        data: string
      }
    }
  | {
      type: 'slab:resize'
      payload: {
        slabId: ID
        cols: number
        rows: number
      }
    }
  | {
      type: 'slab:kill'
      payload: {
        slabId: ID
      }
    }
  | {
      type: 'slab:restart'
      payload: {
        slabId: ID
      }
    }

export type TerminalResponse =
  | {
      ok: true
      data?: unknown
    }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }

export type TerminalEvent =
  | {
      type: 'slab:data'
      payload: {
        slabId: ID
        data: string
      }
    }
  | {
      type: 'slab:exit'
      payload: {
        slabId: ID
        exitCode: number | null
        signal?: number
      }
    }
  | {
      type: 'slab:status'
      payload: {
        slabId: ID
        status: Slab['status']
      }
    }
  | {
      type: 'workspace:changed'
      payload: {
        workspace: Workspace
      }
    }

export const TERMINAL_REQUEST_CHANNEL = 'terminal:request'
export const TERMINAL_EVENT_CHANNEL = 'terminal:event'
