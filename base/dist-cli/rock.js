#!/usr/bin/env node

// call/rock.ts
import { createConnection } from "node:net";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
var SOCKET = join(tmpdir(), "rock.sock");
var VERSION = "0.0.6";
function callRock(cmd, args) {
  return new Promise((resolveP, reject) => {
    if (!existsSync(SOCKET)) {
      reject(
        new Error(
          `Rock.app isn't running (no socket at ${SOCKET}). Run \`rock\` first.`
        )
      );
      return;
    }
    const conn = createConnection(SOCKET);
    let buf = "";
    let settled = false;
    conn.setTimeout(5e3);
    conn.on("connect", () => {
      const req = JSON.stringify({ cmd, args });
      conn.write(req + "\n");
    });
    conn.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const idx = buf.indexOf("\n");
      if (idx < 0) return;
      const line = buf.slice(0, idx).trim();
      try {
        const res = JSON.parse(line);
        settled = true;
        conn.end();
        resolveP(res);
      } catch (err) {
        if (!settled) reject(err);
      }
    });
    conn.on("timeout", () => {
      if (!settled) {
        conn.destroy();
        reject(new Error("Rock IPC timed out after 5s"));
      }
    });
    conn.on("error", (err) => {
      if (!settled) reject(err);
    });
  });
}
async function callOrDie(cmd, args) {
  const res = await callRock(cmd, args);
  if (!res.ok) {
    process.stderr.write(`rock: ${res.error}
`);
    process.exit(1);
  }
  return res.data;
}
function usage() {
  return `rock \u2014 companion CLI for Rock.app

USAGE
  rock [open] [path]      Open Rock.app, cwd defaulting to $PWD
  rock bind               Scaffold .rock/code/ for this project
  rock list               List running slabs
  rock send <slab> <text> Send keystrokes to a slab
  rock focus <slab>       Activate a slab
  rock spawn [name] [--cwd=path]
                          Spawn a new slab (uses default shell)
  rock kill <slab>        Kill a slab (and its PTY)
  rock doctor             Health check
  rock --help             Show this
  rock --version          ${VERSION}

EXAMPLES
  cd ~/code/my-app && rock          # open here, project-scoped
  rock open ~/other-project          # open elsewhere
  rock spawn dev --cwd=~/code/site   # spawn a named shell
  rock send dev "pnpm dev\\n"        # type into it
  rock list                          # see what's running
  rock kill dev                      # stop it
`;
}
async function cmdOpen(target) {
  if (!existsSync(target)) {
    process.stderr.write(`rock: not a directory: ${target}
`);
    process.exit(1);
  }
  const abs = isAbsolute(target) ? target : resolve(target);
  const proc = spawn("open", ["-a", "Rock", "--args", `--cwd=${abs}`], {
    stdio: "inherit",
    detached: true
  });
  proc.on("error", (err) => {
    process.stderr.write(`rock: failed to launch Rock.app: ${err.message}
`);
    process.exit(1);
  });
  proc.unref();
}
function cmdBind() {
  if (existsSync(".rock")) {
    process.stderr.write(`rock: .rock/ already exists in ${process.cwd()}
`);
    process.exit(1);
  }
  mkdirSync(".rock/code", { recursive: true });
  writeFileSync(
    ".rock/code/index.tsx",
    `// .rock/code/index.tsx \u2014 your Rock workspace
//
// Whatever you default-export here becomes your Rock app.
// All keys are optional; provide what you need.
//
//   workspace : the slabs (terminals) to spawn at launch
//   Layout    : optional React component to replace the
//               entire renderer
//   Sidebar   : optional React component for just the sidebar
//   commands  : optional command palette entries

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
    "utf-8"
  );
  writeFileSync(
    ".rock/.gitignore",
    `# Rock stores per-machine state here (window position,
# tabs, last-known cwds). Don't commit it.
base.json
`,
    "utf-8"
  );
  process.stdout.write(`rock: scaffolded .rock/ in ${process.cwd()}
`);
  process.stdout.write(`  \u2022 edit .rock/code/index.tsx to customize
`);
  process.stdout.write(`  \u2022 run \`rock\` here to launch Rock.app
`);
}
async function cmdList() {
  const slabs = await callOrDie("list-slabs");
  if (slabs.length === 0) {
    process.stdout.write(`(no slabs)
`);
    return;
  }
  const widths = {
    name: Math.max(4, ...slabs.map((s) => s.name.length)),
    status: Math.max(6, ...slabs.map((s) => s.status.length))
  };
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
  process.stdout.write(
    `${pad("NAME", widths.name)}  ${pad("STATUS", widths.status)}  CWD
`
  );
  for (const slab of slabs) {
    process.stdout.write(
      `${pad(slab.name, widths.name)}  ${pad(slab.status, widths.status)}  ${slab.cwd ?? ""}
`
    );
  }
}
async function cmdSend(slab, text) {
  await callOrDie("send", { slab, text });
}
async function cmdFocus(slab) {
  await callOrDie("focus", { slab });
}
async function cmdSpawn(opts) {
  const res = await callOrDie("spawn", opts);
  process.stdout.write(`spawned: ${res.name}
`);
}
async function cmdKill(slab) {
  await callOrDie("kill", { slab });
}
async function cmdDoctor() {
  const checks = [];
  const sockExists = existsSync(SOCKET);
  checks.push(["IPC socket", sockExists, SOCKET]);
  if (sockExists) {
    try {
      const res = await callRock("ping");
      checks.push(["Rock.app reachable", res.ok, res.ok ? "pong" : res.error]);
    } catch (err) {
      checks.push(["Rock.app reachable", false, String(err)]);
    }
  }
  checks.push(["hostname", true, hostname()]);
  for (const [label, ok, info] of checks) {
    const mark = ok ? "\u2713" : "\u2715";
    process.stdout.write(`${mark} ${label.padEnd(20)}  ${info}
`);
  }
}
function parseFlag(args, name) {
  for (const a of args) {
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return void 0;
}
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "open";
  const rest = argv.slice(1);
  try {
    switch (cmd) {
      case "--help":
      case "-h":
      case "help":
        process.stdout.write(usage());
        return;
      case "--version":
      case "-v":
      case "version":
        process.stdout.write(`rock ${VERSION}
`);
        return;
      case "open":
        await cmdOpen(rest[0] ?? process.cwd());
        return;
      case "bind":
        cmdBind();
        return;
      case "list":
      case "list-slabs":
        await cmdList();
        return;
      case "send":
        if (rest.length < 2) {
          process.stderr.write(`rock send: usage: rock send <slab> <text>
`);
          process.exit(1);
        }
        await cmdSend(rest[0], rest.slice(1).join(" "));
        return;
      case "focus":
        if (!rest[0]) {
          process.stderr.write(`rock focus: usage: rock focus <slab>
`);
          process.exit(1);
        }
        await cmdFocus(rest[0]);
        return;
      case "spawn":
        await cmdSpawn({
          name: rest.find((a) => !a.startsWith("--")),
          cwd: parseFlag(rest, "cwd")
        });
        return;
      case "kill":
        if (!rest[0]) {
          process.stderr.write(`rock kill: usage: rock kill <slab>
`);
          process.exit(1);
        }
        await cmdKill(rest[0]);
        return;
      case "doctor":
        await cmdDoctor();
        return;
      default:
        if (existsSync(cmd)) {
          await cmdOpen(cmd);
          return;
        }
        process.stderr.write(`rock: unknown command '${cmd}' \u2014 try 'rock --help'
`);
        process.exit(1);
    }
  } catch (err) {
    process.stderr.write(
      `rock: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
}
void main();
