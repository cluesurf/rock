/**
 * Unix-socket IPC server for the `term` CLI.
 *
 * Runs in Term.app's main process. The CLI connects to
 * the socket, sends one or more newline-delimited JSON
 * requests, and reads newline-delimited JSON responses.
 *
 * Protocol:
 *
 *   request   { id?: string, cmd: string, args?: any }
 *   response  { id?: string, ok: true, data?: any }
 *           | { id?: string, ok: false, error: string }
 *
 * `id` is echoed back so the CLI can multiplex if it ever
 * sends concurrent requests on one connection. Currently
 * each CLI invocation opens a single connection, sends one
 * request, reads one response, and closes.
 *
 * Socket path: `<tmpdir>/term.sock`. macOS gives a
 * per-user tmpdir, so multiple users on one machine each
 * get their own socket without collision.
 */

import { createServer, type Server, type Socket } from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const TERM_SOCKET_PATH = join(tmpdir(), 'term.sock')

export type TermCliRequest = {
  id?: string
  cmd: string
  args?: unknown
}

export type TermCliResponse =
  | { id?: string; ok: true; data?: unknown }
  | { id?: string; ok: false; error: string }

export type TermCliHandler = (
  cmd: string,
  args: unknown,
) => Promise<unknown> | unknown

/**
 * Start the CLI IPC server. Idempotent — safe to call once
 * per process. Cleans up the socket on graceful shutdown.
 */
export function startTermIpcServer(handler: TermCliHandler): Server {
  // Stale socket from a previous unclean exit blocks listen.
  if (existsSync(TERM_SOCKET_PATH)) {
    try { unlinkSync(TERM_SOCKET_PATH) } catch { /* ignore */ }
  }
  const server = createServer(socket => handleConnection(socket, handler))
  server.on('error', err => {
    console.warn('[term] CLI IPC server error:', err)
  })
  server.listen(TERM_SOCKET_PATH)
  return server
}

function handleConnection(socket: Socket, handler: TermCliHandler): void {
  let buf = ''
  socket.on('data', async chunk => {
    buf += chunk.toString('utf8')
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (line.length === 0) continue
      await processLine(line, socket, handler)
    }
  })
  socket.on('error', () => {
    // Client hung up; nothing to do.
  })
}

async function processLine(
  line: string,
  socket: Socket,
  handler: TermCliHandler,
): Promise<void> {
  let req: TermCliRequest
  try {
    req = JSON.parse(line) as TermCliRequest
  } catch (err) {
    const res: TermCliResponse = {
      ok: false,
      error: `bad json: ${err instanceof Error ? err.message : err}`,
    }
    socket.write(JSON.stringify(res) + '\n')
    return
  }
  try {
    const data = await handler(req.cmd, req.args)
    const res: TermCliResponse = { id: req.id, ok: true, data }
    socket.write(JSON.stringify(res) + '\n')
  } catch (err) {
    const res: TermCliResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    socket.write(JSON.stringify(res) + '\n')
  }
}
