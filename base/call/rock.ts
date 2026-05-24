#!/usr/bin/env node
/**
 * rock — companion CLI for Rock.app.
 *
 * Bundled into Rock.app's Resources/ and invoked via the
 * bash launcher (Rock.app/Contents/Resources/rock) which
 * sets ELECTRON_RUN_AS_NODE=1 and execs the bundled
 * Electron in Node mode. Users get it on PATH via the
 * Homebrew cask's `binary` directive.
 *
 * Commands that need a running Rock.app (list / send /
 * focus / spawn / kill / doctor) talk to it over a
 * Unix-domain socket at $TMPDIR/rock.sock. The server
 * lives in code/node/ipc-server.ts.
 */

import { createConnection } from 'node:net'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, hostname, homedir } from 'node:os'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { spawn } from 'node:child_process'
import yargs from 'yargs'

const SOCKET = join(tmpdir(), 'rock.sock')

// __ROCK_VERSION__ is injected by esbuild's --define at
// build time, reading base/package.json's version. The
// `typeof` guard keeps `tsc` happy and gives a sane
// fallback when the file is run directly under tsx etc.
declare const __ROCK_VERSION__: string
const VERSION =
  typeof __ROCK_VERSION__ === 'string' ? __ROCK_VERSION__ : '0.0.0-dev'

// ────────────────────────────────────────────────────────
// IPC client
// ────────────────────────────────────────────────────────

type Response =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

function callRock(cmd: string, args?: unknown): Promise<Response> {
  return new Promise((resolveP, reject) => {
    if (!existsSync(SOCKET)) {
      reject(
        new Error(
          `Rock.app isn't running (no socket at ${SOCKET}). Run \`rock\` first.`,
        ),
      )
      return
    }
    const conn = createConnection(SOCKET)
    let buf = ''
    let settled = false
    conn.setTimeout(5000)
    conn.on('connect', () => {
      conn.write(JSON.stringify({ cmd, args }) + '\n')
    })
    conn.on('data', chunk => {
      buf += chunk.toString('utf8')
      const idx = buf.indexOf('\n')
      if (idx < 0) return
      try {
        const res = JSON.parse(buf.slice(0, idx).trim()) as Response
        settled = true
        conn.end()
        resolveP(res)
      } catch (err) {
        if (!settled) reject(err)
      }
    })
    conn.on('timeout', () => {
      if (!settled) {
        conn.destroy()
        reject(new Error('Rock IPC timed out after 5s'))
      }
    })
    conn.on('error', err => {
      if (!settled) reject(err)
    })
  })
}

async function callOrDie(cmd: string, args?: unknown): Promise<unknown> {
  const res = await callRock(cmd, args)
  if (!res.ok) {
    process.stderr.write(`rock: ${res.error}\n`)
    process.exit(1)
  }
  return res.data
}

// ────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────

async function cmdOpen(targetPath: string): Promise<void> {
  if (!existsSync(targetPath)) {
    throw new Error(`not a directory: ${targetPath}`)
  }
  const abs = isAbsolute(targetPath) ? targetPath : resolve(targetPath)
  const proc = spawn('open', ['-a', 'Rock', '--args', `--cwd=${abs}`], {
    stdio: 'inherit',
    detached: true,
  })
  proc.on('error', err => {
    throw new Error(`failed to launch Rock.app: ${err.message}`)
  })
  proc.unref()
}

function cmdBind(): void {
  if (existsSync('.rock')) {
    throw new Error(`.rock/ already exists in ${process.cwd()}`)
  }
  mkdirSync('.rock/code', { recursive: true })
  writeFileSync(
    '.rock/code/index.tsx',
    `\
// .rock/code/index.tsx — your Rock workspace.
// Whatever you default-export becomes your Rock app.

import { workspace } from '@cluesurf/rock'

export default {
  workspace: workspace({
    name: 'my-project',
    slabs: {
      shell: {},
      // dev:  { command: 'pnpm dev' },
      // logs: { command: 'tail -f logs/app.log' },
    },
  }),
}
`,
    'utf-8',
  )
  writeFileSync(
    '.rock/.gitignore',
    `# Rock stores per-machine state here. Don't commit it.\nbase.local.json\n.cache/\n`,
    'utf-8',
  )
  process.stdout.write(`rock: scaffolded .rock/ in ${process.cwd()}\n`)
  process.stdout.write(`  edit .rock/code/index.tsx to customize\n`)
  process.stdout.write(`  run \`rock\` here to launch Rock.app\n`)
}

async function cmdList(): Promise<void> {
  const slabs = (await callOrDie('list-slabs')) as Array<{
    name: string
    status: string
    cwd?: string
  }>
  if (slabs.length === 0) {
    process.stdout.write(`(no slabs)\n`)
    return
  }
  const wName = Math.max(4, ...slabs.map(s => s.name.length))
  const wStatus = Math.max(6, ...slabs.map(s => s.status.length))
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
  process.stdout.write(`${pad('NAME', wName)}  ${pad('STATUS', wStatus)}  CWD\n`)
  for (const slab of slabs) {
    process.stdout.write(`${pad(slab.name, wName)}  ${pad(slab.status, wStatus)}  ${slab.cwd ?? ''}\n`)
  }
}

async function cmdSend(slab: string, text: string): Promise<void> {
  await callOrDie('send', { slab, text })
}

async function cmdFocus(slab: string): Promise<void> {
  await callOrDie('focus', { slab })
}

async function cmdSpawn(opts: { name?: string; cwd?: string }): Promise<void> {
  const res = (await callOrDie('spawn', opts)) as { name: string }
  process.stdout.write(`spawned: ${res.name}\n`)
}

async function cmdKill(slab: string): Promise<void> {
  await callOrDie('kill', { slab })
}

async function cmdDoctor(): Promise<void> {
  const sockExists = existsSync(SOCKET)
  process.stdout.write(`${sockExists ? '✓' : '✕'} IPC socket           ${SOCKET}\n`)
  if (sockExists) {
    try {
      const res = await callRock('ping')
      process.stdout.write(
        `${res.ok ? '✓' : '✕'} Rock.app reachable    ${res.ok ? 'pong' : (res as { error: string }).error}\n`,
      )
    } catch (err) {
      process.stdout.write(`✕ Rock.app reachable    ${String(err)}\n`)
    }
  }
  process.stdout.write(`✓ hostname              ${hostname()}\n`)
  process.stdout.write(`✓ COLORTERM             ${process.env.COLORTERM ?? '(unset)'}\n`)
  process.stdout.write(`✓ TERM                  ${process.env.TERM ?? '(unset)'}\n`)
}

async function cmdInstallTheme(target: string): Promise<void> {
  // Bundled theme dir = Rock.app/Contents/Resources/themes/<target>/.
  const here = dirname(new URL(import.meta.url).pathname)
  const sourceDir = join(here, 'themes', target)
  if (!existsSync(sourceDir)) {
    throw new Error(
      `no bundled themes for '${target}'. Looked in: ${sourceDir}`,
    )
  }
  const installs: Record<string, string> = {
    claude: join(homedir(), '.claude', 'themes'),
  }
  const targetDir = installs[target]
  if (!targetDir) {
    throw new Error(
      `'${target}' isn't a known target. Supported: ${Object.keys(installs).join(', ')}`,
    )
  }
  mkdirSync(targetDir, { recursive: true })
  const files = readdirSync(sourceDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) throw new Error(`nothing to install in ${sourceDir}`)
  for (const file of files) {
    const src = join(sourceDir, file)
    const dest = join(targetDir, file)
    writeFileSync(dest, readFileSync(src, 'utf-8'), 'utf-8')
    process.stdout.write(`  installed ${file} → ${dest}\n`)
  }
  if (target === 'claude') {
    process.stdout.write(
      `\nIn Claude Code, run /theme and pick "Rock Dark" or "Rock Light".\n`,
    )
  }
}

// ────────────────────────────────────────────────────────
// CLI definition (yargs)
// ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Don't use yargs' hideBin: it special-cases Electron and
  // does argv.slice(1) when process.versions.electron is
  // truthy. That leaves the script path (rock.js) in argv
  // because Rock.app runs as ELECTRON_RUN_AS_NODE=1 with
  // its bundled Electron, which still reports as Electron.
  // We always invoke as `Electron rock.js …`, so the
  // standard Node-style slice(2) is correct.
  const argv = process.argv.slice(2)

  // Subtle: `rock` with no args opens at $PWD. Yargs would
  // normally show help; intercept that case first.
  if (argv.length === 0) {
    await cmdOpen(process.cwd())
    return
  }

  await yargs(argv)
    .scriptName('rock')
    .version(VERSION)
    .usage('$0 <cmd> [args]')
    .strict()
    .demandCommand(1)
    .recommendCommands()
    .help()
    .wrap(Math.min(100, process.stdout.columns ?? 100))
    .command(
      'open [path]',
      'Open Rock.app at the given dir (default $PWD)',
      y =>
        y.positional('path', {
          describe: 'Directory to open',
          type: 'string',
        }),
      async args => {
        await cmdOpen((args.path as string | undefined) ?? process.cwd())
      },
    )
    .command(
      'bind',
      'Scaffold .rock/code/ for this project',
      y => y,
      () => cmdBind(),
    )
    .command(
      'list',
      'List running slabs',
      y => y,
      async () => {
        await cmdList()
      },
    )
    .command(
      'send <slab> <text..>',
      'Send keystrokes to a slab',
      y =>
        y
          .positional('slab', { type: 'string', demandOption: true })
          .positional('text', { type: 'string', array: true, demandOption: true }),
      async args => {
        const text = (args.text as string[]).join(' ')
        await cmdSend(args.slab as string, text)
      },
    )
    .command(
      'focus <slab>',
      'Activate a slab',
      y => y.positional('slab', { type: 'string', demandOption: true }),
      async args => {
        await cmdFocus(args.slab as string)
      },
    )
    .command(
      'spawn [name]',
      'Spawn a new slab',
      y =>
        y
          .positional('name', {
            describe: 'Slab name; auto-picked if omitted',
            type: 'string',
          })
          .option('cwd', {
            describe: 'Working directory for the new shell',
            type: 'string',
          }),
      async args => {
        await cmdSpawn({
          name: args.name as string | undefined,
          cwd: args.cwd as string | undefined,
        })
      },
    )
    .command(
      'kill <slab>',
      'Kill a slab and its PTY',
      y => y.positional('slab', { type: 'string', demandOption: true }),
      async args => {
        await cmdKill(args.slab as string)
      },
    )
    .command(
      'install <kind> <target>',
      "Install bundled config into another app (eg: 'install theme claude')",
      y =>
        y
          .positional('kind', {
            type: 'string',
            choices: ['theme'] as const,
            demandOption: true,
          })
          .positional('target', {
            type: 'string',
            demandOption: true,
          }),
      async args => {
        if (args.kind === 'theme') {
          await cmdInstallTheme(args.target as string)
        }
      },
    )
    .command(
      'doctor',
      'Health check (socket, app status, env)',
      y => y,
      async () => {
        await cmdDoctor()
      },
    )
    .epilogue(
      'Rock.app docs: https://github.com/cluesurf/rock\n' +
        'Companion CLI for the macOS terminal workspace.',
    )
    .fail((msg, err) => {
      const message = err?.message ?? msg ?? 'unknown error'
      process.stderr.write(`rock: ${message}\n`)
      process.exit(1)
    })
    .parseAsync()
}

void main().catch(err => {
  process.stderr.write(
    `rock: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
