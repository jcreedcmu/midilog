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

## Architecture

### Data Format
MIDI events are stored as JSON lines in `log/YYYY-MM-DD.json`. Each line is a "chunk" (recording session):
```json
{"uuid": "...", "start": 1513467890123, "events": [{"message": [144,60,64], "delta": {"midi_us": 0, "wall_ms": 0}}, ...]}
```
- `start`: Milliseconds since epoch for the start of this recording
- `uuid`: Unique identifier for the recording (optional, added to new recordings)
- `message`: Raw MIDI bytes (e.g., [144, pitch, velocity] for note-on)
- `delta.midi_us`: Microseconds since previous event (MIDI timestamp)
- `delta.wall_ms`: Milliseconds since previous event (wall clock)

### App Structure
- `src/index.ts` - Express server, serves static files and `/api/save` endpoint
- `src/logger.ts` - Browser entry point, handles MIDI input capture
- `src/app.tsx` - React UI for playback with piano roll visualization
- `src/song.ts` - Song data types and conversion (delta-based → absolute time → note events)
- `public/` - Static assets (HTML, CSS, icons)

The build produces two bundles: `out/index.js` (server) and `out/logger.js` (browser).
