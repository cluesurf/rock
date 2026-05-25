export type ID = string

export type Workspace = {
  id: ID
  name: string
  root: string
  layout: LayoutNode
  tabs: Tab[]
  createdAt: number
  updatedAt: number
}

export type Tab = {
  id: ID
  workspaceId: ID
  name: string
  root?: string
  layout: LayoutNode
}

export type Slab = {
  id: ID
  workspaceId: ID
  tabId: ID
  name: string
  cwd: string
  program: string
  args: string[]
  command?: string
  env?: Record<string, string>
  cols: number
  rows: number
  status: SlabStatus
  createdAt: number
  updatedAt: number
}

export type SlabStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'exited'
  | 'failed'

export type LayoutNode =
  | {
      type: 'slab'
      slabId: ID
    }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio: number
      children: [LayoutNode, LayoutNode]
    }
