export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe'
  }
  return process.env.SHELL ?? defaultUnixShell()
}

function defaultUnixShell(): string {
  if (process.platform === 'darwin') return '/bin/zsh'
  return '/bin/bash'
}
