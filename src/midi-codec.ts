import type { SongEvent } from './song.ts';

// MIDI file constants
const PPQ = 5000; // ticks per quarter note
const TEMPO = 500000; // microseconds per beat (120 BPM)
// With PPQ=5000 and TEMPO=500000: 1 tick = TEMPO/PPQ = 100 us

function encodeVlq(value: number): number[] {
  if (value < 0) value = 0;
  if (value < 0x80) return [value];
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}

function decodeVlq(data: Uint8Array, offset: number): { value: number; length: number } {
  let value = 0;
  let length = 0;
  while (true) {
    const byte = data[offset + length];
    value = (value << 7) | (byte & 0x7f);
    length++;
    if ((byte & 0x80) === 0) break;
  }
  return { value, length };
}

// Number of data bytes following a status byte, by high nibble
function messageLengthFromStatus(status: number): number {
  const hi = status & 0xf0;
  switch (hi) {
    case 0x80: return 2; // note off
    case 0x90: return 2; // note on
    case 0xa0: return 2; // aftertouch
    case 0xb0: return 2; // control change
    case 0xc0: return 1; // program change
    case 0xd0: return 1; // channel pressure
    case 0xe0: return 2; // pitch bend
    default: return 0;
  }
}

function writeUint32BE(arr: number[], value: number): void {
  arr.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function writeUint16BE(arr: number[], value: number): void {
  arr.push((value >> 8) & 0xff, value & 0xff);
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

export function eventsToMidi(events: SongEvent[]): Uint8Array {
  // Build MTrk data
  const trackData: number[] = [];

  // Tempo meta-event at delta=0: FF 51 03 <3 bytes tempo>
  trackData.push(0x00); // delta = 0
  trackData.push(0xff, 0x51, 0x03);
  trackData.push((TEMPO >> 16) & 0xff, (TEMPO >> 8) & 0xff, TEMPO & 0xff);

  // Events
  for (const event of events) {
    const midi_us = event.delta.midi_us > 0x100000000 ? 0 : event.delta.midi_us;
    const ticks = Math.round(midi_us / 100); // 1 tick = 100 us
    trackData.push(...encodeVlq(ticks));
    trackData.push(...event.message);
  }

  // End of track: 00 FF 2F 00
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  // Build complete MIDI file
  const result: number[] = [];

  // MThd header
  // "MThd"
  result.push(0x4d, 0x54, 0x68, 0x64);
  writeUint32BE(result, 6);      // header length
  writeUint16BE(result, 0);      // format 0
  writeUint16BE(result, 1);      // 1 track
  writeUint16BE(result, PPQ);    // ticks per quarter note

  // MTrk chunk
  // "MTrk"
  result.push(0x4d, 0x54, 0x72, 0x6b);
  writeUint32BE(result, trackData.length);
  result.push(...trackData);

  return new Uint8Array(result);
}

export function midiToEvents(data: Buffer | Uint8Array): SongEvent[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  // Parse MThd
  // Skip "MThd" magic (4 bytes) + header length (4 bytes) + format (2 bytes) + ntrks (2 bytes)
  const ppq = readUint16BE(bytes, 12);

  // Find MTrk
  let offset = 14; // after MThd header (4+4+2+2+2 = 14)

  // Skip to MTrk
  while (offset < bytes.length - 4) {
    if (bytes[offset] === 0x4d && bytes[offset + 1] === 0x54 &&
      bytes[offset + 2] === 0x72 && bytes[offset + 3] === 0x6b) {
      break;
    }
    offset++;
  }

  const trackLength = readUint32BE(bytes, offset + 4);
  offset += 8; // skip "MTrk" + length
  const trackEnd = offset + trackLength;

  const events: SongEvent[] = [];
  let runningStatus = 0;

  while (offset < trackEnd) {
    // Read VLQ delta
    const vlq = decodeVlq(bytes, offset);
    offset += vlq.length;
    const ticks = vlq.value;

    // Peek at next byte
    const byte = bytes[offset];

    if (byte === 0xff) {
      // Meta event: FF type length data...
      offset++; // skip FF
      const _type = bytes[offset++];
      const metaVlq = decodeVlq(bytes, offset);
      offset += metaVlq.length;
      offset += metaVlq.value; // skip meta data
      // Check for end of track
      if (_type === 0x2f) break;
      continue;
    }

    if (byte === 0xf0 || byte === 0xf7) {
      // SysEx event
      offset++; // skip F0/F7
      const sxVlq = decodeVlq(bytes, offset);
      offset += sxVlq.length;
      offset += sxVlq.value; // skip sysex data
      continue;
    }

    // Channel message
    let status: number;
    if (byte & 0x80) {
      // New status byte
      status = byte;
      runningStatus = status;
      offset++;
    } else {
      // Running status
      status = runningStatus;
    }

    const dataLen = messageLengthFromStatus(status);
    const message = [status];
    for (let i = 0; i < dataLen; i++) {
      message.push(bytes[offset++]);
    }

    const midi_us = Math.round(ticks * (TEMPO / ppq));

    events.push({
      message,
      delta: { midi_us, wall_ms: 0 },
    });
  }

  return events;
}
