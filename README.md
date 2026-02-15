# midilog

I wanted a low-stakes way of recording from my midi keyboard and making
it easy to go back over historical recordings and tag bits I like and filter out bits I don't like.

`old-commandline-tool/midilog.js` was the oldest version of this code, using some midi node module

The stuff now in the toplevel directory uses the web midi api, and
gives a little bit of UX for editing tags.

## soundfont

The soundfont in `soundfont/gm-good.sf3` is what I got by running `sf3convert`
  on [Arachno_SoundFont_Version_1.0.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Arachno_SoundFont_Version_1.0.sf2) which was linked from [this reddit thread](https://www.reddit.com/r/midi/comments/pmh94q/whats_the_best_allaround_soundfont/)
  (I also tried [Jnsgm.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Jnsgm.sf2) which was ok)

## Build

```bash
npm install
```

### Development (includes recording and playback, and tag editing)

```bash
node build.mjs       # build once (or: node build.mjs watch)
make serve            # run server on port 8000
```

### Static readonly build (for GitHub Pages)

```bash
make static           # generates dist/
```

Bakes all song data into `dist/`, disables recording/editing and midi
functionality, uses software synth only. Deployable to any static
host. A GitHub Actions workflow (`.github/workflows/static.yml`) automatically builds and deploys to Pages on push to `main`.

## Design Notes

### Data storage
Recording data lives in `data/` with a content-addressed layout:

- `data/index.json` — array of entry metadata:
  ```json
  {"date": "2017-12-16", "ix": 0, "start": "2017-12-17T00:08:13.558Z", "duration_ms": 59051.16, "hash": "b0a5cc6dd6c2b065", "uuid": "...", "tags": [...]}
  ```
- `data/log/<hash>.json` — event data (array of MIDI events), keyed by content hash

Each event has:
- `message`: Raw MIDI bytes (e.g., `[144, pitch, velocity]` for note-on)
- `delta.midi_us`: Microseconds since previous event (MIDI timestamp)
- `delta.wall_ms`: Milliseconds since previous event (wall clock)

Songs go through three representations (defined in `song.ts`):
- `Song` — raw delta-based events, as stored on disk
- `TimedSong` — events with absolute `time_ms` timestamps, used for playback scheduling
- `NoteSong` — note-on/off pairs collapsed into note events with pitch, velocity, time, and duration, used for piano roll rendering

The conversion pipeline is `Song` → `timedSong()` → `TimedSong` → `noteSong()` → `NoteSong`.

### Server (`src/index.ts`)
Express server with a few endpoints:
- `GET /logIndex.json` — returns the full index
- `GET /log/:file` — returns all songs for a date file, resolving content hashes to full event data
- `POST /api/content` — stores event data content-addressed, returns `{ hash }`
- `POST /api/save` — upserts an index entry (used for saving tag edits, deletions, new recordings)

### Browser entry point (`src/logger.ts`)
- Requests Web MIDI access and finds the configured MIDI input device
- Fetches the soundfont and song index in parallel
- Initializes the React app and wires up MIDI input events
- On each MIDI message, computes delta timing and dispatches `addPendingEvent` to the app

### UI (`src/app.tsx`)
Single-page React app using `useState` for all state (`AppState` in `types.ts`). No reducer — instead, a `dispatch` function manually switches on `Action` types and calls `setState`. Key UI pieces:

- **Navbar** — song name, transport controls (play/pause, skip, speed toggle), save/revert buttons
- **Piano roll canvas** — rendered via `requestAnimationFrame` loop through `useCanvas` hook. Click to toggle play/pause, drag to seek (when paused), scroll wheel to zoom. The top two lanes are for pedal marks and tags.
- **Sidebar panels** — toggled by icon buttons overlaying the canvas:
  - *Files* — list of all recordings, click to load, with delete/undelete
  - *Recording* — shows pending event count, save/discard buttons, auto-save toggle
  - *Settings* — switch between software synth and hardware MIDI output
  - *Tags* — list of tags on current song, click to seek

**Playback** works by scheduling the next MIDI event via `requestAnimationFrame` callbacks. The `Playback` state tracks `startTime_ms` (wall clock reference) and a `playhead` with the current event index. Pausing stores `pausedAt_ms`; resuming adjusts `startTime_ms` to account for the pause duration.

**Recording** accumulates `SongEvent`s in `state.pendingEvents`. On save, event data is POSTed to `/api/content` to get a hash, then the new entry is added to the front of the songs list. Auto-save (optional) triggers a save after 10 seconds of MIDI inactivity.

**Tag editing** uses pointer events on the tag lane of the canvas: drag to create, drag existing tag to move, drag right edge to resize, double-click to rename inline.

**Dirty tracking** — edits (tag changes, deletes, new recordings) mark entries as `dirty`. The save button in the navbar POSTs all dirty entries to `/api/save`. The revert button re-fetches the index from the server, discarding unsaved changes while preserving playback state.

### Audio output (`src/audio-output.ts`)
Abstraction over two output modes:
- **Software synth** — SpessaSynth (sf3 soundfont), lazily initialized on first use via AudioWorklet
- **MIDI device** — direct Web MIDI output to hardware

### Canvas rendering (`src/render-canvas.ts`)
Draws the piano roll centered on the playhead position. Notes are colored by pitch class. Active notes get a shadow glow. Top lanes show pedal activity and tags.

### Other files
- `src/types.ts` — shared types (`AppState`, `Action`, `Playback`, etc.) and pure helper functions (scheduling, seeking)
- `src/use-canvas.ts` — React hook for managing a canvas element with DPR-aware sizing and a `ResizeObserver`
- `src/point.ts` — simple `{x, y}` point type
- `public/` — static HTML, CSS, icons
- `build.mjs` — esbuild config producing `out/index.js` (server) and `out/logger.js` (browser)
- `build-static.mjs` — static build variant that sets `READONLY=true`, bakes in all song data, no server needed
