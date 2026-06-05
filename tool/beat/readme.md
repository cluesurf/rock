<br/>
<br/>

<h3 align='center'>@cluesurf/tool-beat</h3>
<p align='center'>
  A mobile music sketchbook ▣
</p>

<br/>
<br/>

## Overview

beat is a mobile app for capturing song-part ideas with almost zero
friction, mostly while driving. The laptop is the DAW. The phone is an
idea capture device. The whole app is a generic "song + sections +
takes" system: tap a section, record an idea, retake rapidly, rate
later.

This is the hello-world boilerplate. It is a runnable, navigable,
branded shell with the four core screens. There is no audio, sqlite, or
sync yet. Those land in later phases. See the full plan in
`note/tool/beat/make/implementation/`.

## What works right now

- Projects lists songs, imports new ones (**+ Import from laptop** over
  Wi-Fi, or **+ Import from Files**), and deletes a song on long-press.
- Project screen: tap sections to select one or more, **Loop** them
  (drag across the loop bar to set base-track volume), or **Record** over
  the selection.
- Recorder loops the selected parts and records real mic audio
  (expo-audio) with a live timer and input-level meter. Each loop wrap
  banks a take and starts a fresh one; **↺ New take** does it on demand.
- Review groups takes by section, filters to All / Liked / Starred,
  plays a take (with stop), **Compare**s a section's takes back-to-back,
  shares a take off the phone (expo-sharing), rates it, or deletes it.
- Songs, sections, and takes **persist** to a JSON document on device
  and survive a reload. Imported audio is copied into durable storage.

Import a real song to get base-track playback and looping. There is no
sample data.

Not yet built: cloud sync (R2), and auto-deletion of blank passes
(deferred — the car track bleeds into the mic, so a simple level check
can't tell singing from background).

## Bootstrapping a song from Logic Pro

1. In Logic, name a marker at the start of each section and bounce the
   song to **M4A** (markers embed as chapter markers).
2. On the Mac, turn the chapters into a sections sidecar:
   ```bash
   node task/sections-from-logic.ts meet-home.m4a "Meet Home"
   ```
   This writes `meet-home.sections.json` next to the audio. Needs
   `ffprobe` (ffmpeg) on PATH. Node 24 runs the TypeScript directly.
   For a WAV export with markers, `task/song-from-logic.sh meet-home.wav
   "Meet Home"` does the marker-to-JSON and a mobile-optimized MP3 in one
   go.
3. Serve the bundle folder from the laptop:
   ```bash
   pnpm serve ~/Desktop 7777
   ```
   It prints a `http://<your-ip>:7777` address.
4. In the app, tap **+ Import from laptop**, enter that address, and tap
   the song. It downloads straight into the app (phone and laptop on the
   same Wi-Fi). No AirDrop needed.

Alternatively, **+ Import from Files** picks an audio file (and optional
`.sections.json`) you got onto the phone some other way.

See `note/tool/beat/make/logic-export.md` and
`note/tool/beat/make/audio-transfer.md` for the full design.

## Run it on your phone

beat is a member of the `deck/tool` pnpm workspace (alongside `term`),
which uses a hoisted `node_modules`. Install from the workspace root,
then start from here. This repo never runs `pnpm install` for you.

```bash
cd deck/tool        # the workspace root (has pnpm-workspace.yaml)
pnpm install        # installs term + beat into deck/tool/node_modules
cd tool/beat
pnpm start          # uses the LOCAL Expo CLI, not the old global one
```

Then install the free **Expo Go** app from the App Store or Play Store,
open the camera (iOS) or Expo Go (Android), and scan the QR code printed
in the terminal. The app loads over your local network, so keep the
phone and laptop on the same Wi-Fi. This app targets **Expo SDK 54**,
which is the SDK the public App Store Expo Go currently runs.

Everything here runs inside Expo Go with no native build. If install
ever resolves mismatched versions, run `pnpm fix` (alias for
`expo install --fix`). To check the setup run `pnpm doctor`.

Note: the `web` target also needs `react-native-web`. Add it with
`npx expo install react-native-web` if you want `pnpm web`.

## Layout

Source is organized to foreshadow the term-modeled structure (a core
library split by runtime role) even though it is one package for now.

```
beat/
  app/                 expo-router routes (thin wrappers)
    _layout.tsx        headerless stack + safe-area provider
    index.tsx          Projects
    project/[id]/
      index.tsx        Project (sections)
      record.tsx       Recorder
      review.tsx       Review
  code/
    base/              runtime-agnostic domain (types, ids, define)
    face/              UI: zustand store, theme, components
```

When the app grows, `code/` becomes the reusable `@cluesurf/tool-beat`
library (compiled to `host/`) with `code/node` device services, `dock/`
becomes the packaged app host, and an `edge/` Cloudflare Worker handles
laptop ingest and R2 sync. The plan in `note/tool/beat/make/` describes
the full target.

## Scripts

```bash
pnpm start     # expo dev server + QR code
pnpm ios       # open in iOS simulator
pnpm android   # open in Android emulator
pnpm web       # run in the browser
pnpm lint      # tsc --noEmit type check
pnpm fix       # expo install --fix (align native versions)
pnpm doctor    # expo-doctor environment check
```
