import os from 'node:os'
import path from 'node:path'

export function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}
