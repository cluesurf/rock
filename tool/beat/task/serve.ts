/**
 * serve
 *
 * Tiny laptop HTTP server so the phone app can import songs
 * straight over Wi-Fi (a replacement for AirDrop). Point it at
 * the folder holding your song bundles, the MP3s plus their
 * `*.sections.json` from `task/song-from-logic.sh`:
 *
 *     node task/serve.ts ~/Desktop 7777
 *
 * It prints the LAN URL to enter in the app under
 * "+ Import from laptop". The phone and laptop must be on the
 * same Wi-Fi.
 *
 * Endpoints:
 *   GET /index.json        list of { name, sections, audioUrl }
 *   GET /audio/<filename>   streams the audio file
 */

import { createServer } from 'node:http'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { networkInterfaces } from 'node:os'

const DIRECTORY = process.argv[2] ?? process.cwd()
const PORT = Number(process.argv[3] ?? 7777)

/** Content types for the audio we serve. */

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
}

type Sidecar = {
  name: string
  audio: string
  sections: { name: string; startMs: number; endMs?: number }[]
}

/** Read every *.sections.json bundle in the served directory. */

function readBundles(): Sidecar[] {
  return readdirSync(DIRECTORY)
    .filter(file => file.endsWith('.sections.json'))
    .map(file => JSON.parse(readFileSync(join(DIRECTORY, file), 'utf8')) as Sidecar)
}

const server = createServer((request, response) => {
  const host = request.headers.host ?? `localhost:${PORT}`
  const url = new URL(request.url ?? '/', `http://${host}`)

  if (url.pathname === '/index.json') {
    const songs = readBundles().map(sidecar => ({
      name: sidecar.name,
      sections: sidecar.sections,
      audioUrl: `http://${host}/audio/${encodeURIComponent(sidecar.audio)}`,
    }))
    response.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    response.end(JSON.stringify({ songs }))
    return
  }

  if (url.pathname.startsWith('/audio/')) {
    // basename guards against path traversal.
    const name = basename(decodeURIComponent(url.pathname.slice('/audio/'.length)))
    const filePath = join(DIRECTORY, name)
    if (!existsSync(filePath)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': AUDIO_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': statSync(filePath).size,
    })
    createReadStream(filePath).pipe(response)
    return
  }

  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('beat serve. GET /index.json')
})

server.listen(PORT, () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(entry => entry && entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry!.address)

  console.log(`serving song bundles from ${DIRECTORY}`)
  if (addresses.length === 0) {
    console.log(`  http://localhost:${PORT}`)
  }
  addresses.forEach(address => console.log(`  http://${address}:${PORT}`))
  console.log('enter that address in the app under + Import from laptop')
})
