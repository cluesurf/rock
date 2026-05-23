import { create } from 'zustand'
import type {
  TerminalEvent,
  TerminalRequest,
} from '@/base/protocol'
import type { ID, Slab, Workspace } from '@/base/types'
import type { TerminalApi } from './terminal-api'

export type TerminalState = {
  api: TerminalApi | null
  workspaces: Workspace[]
  slabs: Record<ID, Slab>
  /**
   * Map from symbolic slab name (as written in
   * `.rock/workspace.ts` and referenced from JSX
   * layout + sidebar) to the compiled slab ID.
   */
  slabIdByName: Record<string, ID>
  activeWorkspaceId?: ID
  activeTabId?: ID
  activeSlabId?: ID

  setApi(api: TerminalApi): void
  setSlabMap(map: Record<string, ID>): void
  request<T = unknown>(request: TerminalRequest): Promise<T>
  createSlab(
    request: TerminalRequest & { type: 'slab:create' },
  ): Promise<Slab>
  setActiveSlab(slabId: ID): void
  setActiveWorkspace(workspaceId: ID): void
  setActiveTab(tabId: ID): void
  upsertWorkspace(workspace: Workspace): void
  upsertSlab(slab: Slab): void
  removeSlab(slabId: ID): void
  applyEvent(event: TerminalEvent): void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  api: null,
  workspaces: [],
  slabs: {},
  slabIdByName: {},

  setApi(api) {
    set({ api })
  },

  setSlabMap(map) {
    set({ slabIdByName: map })
  },

  async request<T>(request: TerminalRequest): Promise<T> {
    const api = get().api
    if (!api) {
      throw new Error(
        'Terminal API not initialized. Mount TerminalApiProvider first.',
      )
    }
    const response = await api.request(request)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    return response.data as T
  },

  async createSlab(request) {
    const slab = await get().request<Slab>(request)
    set(state => ({
      slabs: {
        ...state.slabs,
        [slab.id]: slab,
      },
      activeSlabId: slab.id,
    }))
    return slab
  },

  setActiveSlab(slabId) {
    set({ activeSlabId: slabId })
  },

  setActiveWorkspace(workspaceId) {
    set({ activeWorkspaceId: workspaceId })
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId })
  },

  upsertWorkspace(workspace) {
    set(state => ({
      workspaces: upsertWorkspaceList(state.workspaces, workspace),
    }))
  },

  upsertSlab(slab) {
    set(state => ({
      slabs: {
        ...state.slabs,
        [slab.id]: slab,
      },
    }))
  },

  removeSlab(slabId) {
    set(state => {
      const { [slabId]: _removed, ...rest } = state.slabs
      return { slabs: rest }
    })
  },

  applyEvent(event) {
    switch (event.type) {
      case 'slab:status':
        set(state => {
          const slab = state.slabs[event.payload.slabId]
          if (!slab) return state
          return {
            slabs: {
              ...state.slabs,
              [slab.id]: {
                ...slab,
                status: event.payload.status,
                updatedAt: Date.now(),
              },
            },
          }
        })
        return

      case 'slab:exit':
        set(state => {
          const slab = state.slabs[event.payload.slabId]
          if (!slab) return state
          return {
            slabs: {
              ...state.slabs,
              [slab.id]: {
                ...slab,
                status: 'exited',
                updatedAt: Date.now(),
              },
            },
          }
        })
        return

      case 'slab:data':
        // Data events are consumed by the rendering slab directly.
        // The store does not duplicate the scrollback buffer.
        return

      case 'workspace:changed':
        set(state => ({
          workspaces: upsertWorkspaceList(
            state.workspaces,
            event.payload.workspace,
          ),
        }))
        return
    }
  },
}))

function upsertWorkspaceList(
  workspaces: Workspace[],
  workspace: Workspace,
): Workspace[] {
  const index = workspaces.findIndex(item => item.id === workspace.id)
  if (index === -1) {
    return [...workspaces, workspace]
  }
  const next = [...workspaces]
  next[index] = workspace
  return next
}
