export function getDefaultProgram(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe'
  }
  return process.env.SHELL ?? defaultUnixProgram()
}

function defaultUnixProgram(): string {
  if (process.platform === 'darwin') return '/bin/zsh'
  return '/bin/bash'
}
