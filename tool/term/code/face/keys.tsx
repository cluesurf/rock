import { useEffect } from 'react'
import { useTerminalStore } from './use-terminal-store'

/**
 * Keyboard shortcut registration.
 *
 *     <Keys bindings={[
 *       { keys: 'cmd+1', do: () => focus('web') },
 *       { keys: 'cmd+shift+r', do: () => restart('api') },
 *     ]} />
 *
 *     // or as a hook
 *     useKeys([{ keys: 'cmd+w', do: () => kill(currentSlab) }])
 */

export type KeyBinding = {
  keys: string
  do: () => void
  /** Skip when the focus is inside a form input. */
  ignoreInputs?: boolean
}

export type KeysProps = {
  bindings: KeyBinding[]
}

export function Keys({ bindings }: KeysProps) {
  useKeys(bindings)
  return null
}

export function useKeys(bindings: KeyBinding[]): void {
  useEffect(() => {
    const parsed = bindings.map(b => ({ ...b, parsed: parseBinding(b.keys) }))

    function onKeyDown(event: KeyboardEvent) {
      for (const binding of parsed) {
        if (matches(event, binding.parsed)) {
          if (
            binding.ignoreInputs &&
            isInputElement(event.target as Element | null)
          ) {
            return
          }
          event.preventDefault()
          binding.do()
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bindings])
}

type Parsed = {
  key: string
  cmd: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

function parseBinding(spec: string): Parsed {
  const parts = spec
    .toLowerCase()
    .split('+')
    .map(p => p.trim())
    .filter(Boolean)

  let key = ''
  let cmd = false
  let ctrl = false
  let alt = false
  let shift = false
  let meta = false

  for (const part of parts) {
    if (part === 'cmd' || part === 'command') cmd = true
    else if (part === 'ctrl' || part === 'control') ctrl = true
    else if (part === 'alt' || part === 'option') alt = true
    else if (part === 'shift') shift = true
    else if (part === 'meta' || part === 'super') meta = true
    else key = part
  }

  return { key, cmd, ctrl, alt, shift, meta }
}

function matches(event: KeyboardEvent, parsed: Parsed): boolean {
  // 'cmd' is mac-mapped to metaKey; on Windows/Linux it falls back to ctrlKey.
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const cmdPressed = isMac ? event.metaKey : event.ctrlKey

  if (parsed.cmd !== cmdPressed) return false
  if (parsed.ctrl && !event.ctrlKey) return false
  if (parsed.alt !== event.altKey) return false
  if (parsed.shift !== event.shiftKey) return false
  if (parsed.meta && !event.metaKey) return false

  const eventKey = event.key.toLowerCase()
  return eventKey === parsed.key
}

function isInputElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

/**
 * Sensible defaults: number keys focus slabs by index,
 * cmd+w kills the focused slab, etc. Opt-in.
 *
 *     <Keys bindings={defaultKeys} />
 *
 * Note: indexed focus relies on the order slabs appear in
 * the workspace map. Override with your own bindings if
 * you want different shortcuts.
 */
export const defaultKeys: KeyBinding[] = (() => {
  const bindings: KeyBinding[] = []

  // Focus slab N (cmd+1 through cmd+9)
  for (let i = 1; i <= 9; i++) {
    bindings.push({
      keys: `cmd+${i}`,
      do: () => {
        const map = useTerminalStore.getState().slabIdByName
        const names = Object.keys(map)
        const targetName = names[i - 1]
        if (!targetName) return
        const id = map[targetName]
        if (id) useTerminalStore.getState().setActiveSlab(id)
      },
    })
  }

  return bindings
})()
