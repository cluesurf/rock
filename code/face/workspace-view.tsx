import type { LayoutNode } from '@/base/types'
import { TerminalSlab } from './terminal-slab'

export type WorkspaceViewProps = {
  layout: LayoutNode
}

export function WorkspaceView({ layout }: WorkspaceViewProps) {
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: '#0b0d10',
      }}
    >
      <LayoutNodeView node={layout} />
    </div>
  )
}

function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (node.type === 'slab') {
    return <TerminalSlab slabId={node.slabId} />
  }

  const [a, b] = node.children
  const first = `${node.ratio * 100}%`
  const second = `${(1 - node.ratio) * 100}%`

  if (node.direction === 'horizontal') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: first, height: '100%', minWidth: 0 }}>
          <LayoutNodeView node={a} />
        </div>
        <ResizeHandle direction="vertical" />
        <div style={{ width: second, height: '100%', minWidth: 0 }}>
          <LayoutNodeView node={b} />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: first, width: '100%', minHeight: 0 }}>
        <LayoutNodeView node={a} />
      </div>
      <ResizeHandle direction="horizontal" />
      <div style={{ height: second, width: '100%', minHeight: 0 }}>
        <LayoutNodeView node={b} />
      </div>
    </div>
  )
}

function ResizeHandle({
  direction,
}: {
  direction: 'horizontal' | 'vertical'
}) {
  return (
    <div
      style={
        direction === 'horizontal'
          ? {
              height: 4,
              cursor: 'row-resize',
              background: '#1f2937',
            }
          : {
              width: 4,
              cursor: 'col-resize',
              background: '#1f2937',
            }
      }
    />
  )
}
