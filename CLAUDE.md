# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Midilog is a browser-based tool for recording and playing back MIDI from a keyboard. It uses the Web MIDI API and can be deployed on mobile for remote control.

An older Node.js CLI implementation exists in `old-commandline-tool/`.

## Commands

```bash
npm install
node build.mjs               # Build once
node build.mjs watch         # Watch mode (rebuilds on file changes)
make serve                   # Run server (port 8000, or PORT env var)
```

## Architecture

### Data Format
MIDI events are stored as JSON lines in `log/YYYY-MM-DD.json`. Each line is a "chunk" (recording session):
```json
{"uuid": "...", "start": 1513467890123, "events": [{"message": [144,60,64], "delta": {"midi_us": 0, "wall_ms": 0}}, ...]}
```
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

## Node Version
Uses Node 20 (see `.nvmrc`).
