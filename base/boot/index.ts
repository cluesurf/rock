import { boot } from '@cluesurf/rock/boot'
import { workspace } from '@cluesurf/rock'

const config = workspace({
  name: 'rock-demo',
  slabs: {
    term:    { command: process.env.SHELL ?? 'zsh' },
    monitor: { command: 'top -l 0 -s 2' },
    clock:   { command: 'sh -c "while true; do date; sleep 1; done"' },
  },
})

boot({
  name: 'Rock',
  workspace: config,
})
