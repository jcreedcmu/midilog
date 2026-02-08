# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Midilog is a lightweight tool for recording and playing back MIDI from a keyboard. It has two implementations:

1. **Node.js CLI** (`midilog.js`) - Uses the `midi` npm package to record/playback via the terminal
2. **Browser app** (`browser/`) - Uses Web MIDI API, deployable on mobile for remote control

## Commands

### Root (Node.js CLI)
```bash
node midilog.js              # Start MIDI recording/playback
```
In the CLI, type `play YYYY-MM-DD N` to play back chunk N from a specific date's log file.

### Browser app
```bash
cd browser
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

### Browser App Structure
- `browser/src/index.ts` - Express server, serves static files and `/api/save` endpoint
- `browser/src/logger.ts` - Browser entry point, handles MIDI input capture
- `browser/src/app.tsx` - Preact UI for playback with piano roll visualization
- `browser/src/song.ts` - Song data types and conversion (delta-based → absolute time → note events)

The build produces two bundles: `out/index.js` (server) and `out/logger.js` (browser).

### Special Keyboard Triggers
Setting the piano to instrument 0 (program change message 192,0) triggers `push.sh` to commit logs. A low/high note plays to indicate success/failure.

## Node Version
Uses Node 20 (see `.nvmrc`).
