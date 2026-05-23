import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Sheet } from './sheet'
import { useKeys } from './keys'
import { useTerminalStore } from './use-terminal-store'

/**
 * Command palette (Cmd+P).
 *
 *     const palette = usePalette({
 *       hotkey: 'cmd+p',
 *       commands: [
 *         { label: 'Restart api', action: () => restart('api') },
 *       ],
 *       autoSlabs: true,
 *     })
 *
 *     <Palette controller={palette} />
 */

export type PaletteCommand = {
  label: string
  group?: string
  hotkey?: string
  icon?: ReactNode
  hidden?: boolean
  action: () => void | Promise<void>
}

export type PaletteController = {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
  commands: PaletteCommand[]
}

export type UsePaletteInput = {
  hotkey?: string
  commands?: PaletteCommand[]
  autoSlabs?: boolean
  placeholder?: string
}

export function usePalette(input: UsePaletteInput = {}): PaletteController {
  const [open, setOpen] = useState(false)
  const slabIdByName = useTerminalStore(s => s.slabIdByName)
  const setActive = useTerminalStore(s => s.setActiveSlab)

  const commands = useMemo<PaletteCommand[]>(() => {
    const result = [...(input.commands ?? [])]
    if (input.autoSlabs) {
      for (const name of Object.keys(slabIdByName)) {
        result.push({
          label: `Focus ${name}`,
          group: 'Slabs',
          action: () => {
            const id = slabIdByName[name]
            if (id) setActive(id)
          },
        })
      }
    }
    return result
  }, [input.commands, input.autoSlabs, slabIdByName, setActive])

  useKeys([
    {
      keys: input.hotkey ?? 'cmd+p',
      do: () => setOpen(o => !o),
    },
  ])

  return {
    open,
    show:   () => setOpen(true),
    hide:   () => setOpen(false),
    toggle: () => setOpen(o => !o),
    commands,
  }
}

export type PaletteProps = {
  controller: PaletteController
  placeholder?: string
}

export function Palette({
  controller,
  placeholder = 'Type a command…',
}: PaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return controller.commands
      .filter(c => !c.hidden)
      .filter(c =>
        q ? c.label.toLowerCase().includes(q) : true,
      )
  }, [controller.commands, query])

  useEffect(() => {
    if (controller.open) {
      setQuery('')
      setSelected(0)
      // focus the input after mount
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [controller.open])

  useEffect(() => {
    setSelected(0)
  }, [query])

  function runSelected() {
    const cmd = filtered[selected]
    if (!cmd) return
    void cmd.action()
    controller.hide()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runSelected()
    }
  }

  return (
    <Sheet open={controller.open} onClose={controller.hide}>
      <div data-rock-palette="">
        <input
          ref={inputRef}
          data-rock-palette-input=""
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div data-rock-palette-list="" role="listbox">
          {filtered.length === 0 && (
            <div data-rock-palette-empty="">No matches</div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={`${cmd.group ?? ''}:${cmd.label}`}
              data-rock-palette-item=""
              data-selected={String(i === selected)}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setSelected(i)}
              onClick={runSelected}
            >
              {cmd.icon && (
                <span data-rock-palette-item-icon="">{cmd.icon}</span>
              )}
              <span data-rock-palette-item-label="">{cmd.label}</span>
              {cmd.group && (
                <span data-rock-palette-item-group="">{cmd.group}</span>
              )}
              {cmd.hotkey && (
                <span data-rock-palette-item-hotkey="">{cmd.hotkey}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
