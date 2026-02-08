export type Song = {
  uuid?: string,
  start: string, // date
  events: SongEvent[],
};

export type TimedSong = {
  start: string, // date
  events: TimedSongEvent[],
};

export type NoteEvent =
  | { t: 'note', vel: number, pitch: number, time_ms: number, dur_ms: number }
  | { t: 'pedal', time_ms: number, dur_ms: number }

export type NoteSong = {
  start: string, // date
  events: NoteEvent[],
};

export type SongEvent = {
  message: number[],
  delta: {
    midi_us: number,
    wall_ms: number,
  }
}

export type TimedSongEvent = {
  message: number[],
  time_ms: number,
}

export type SongEntry = { file: string, ix: number, song: Song, duration_ms: number };
export type SongLibrary = SongEntry[];

export function sanitizeMidiUs(midi_us: number): number {
  return midi_us > 0x100000000 ? 0 : midi_us;
}

export function chunkDuration_ms(events: SongEvent[]): number {
  let total_us = 0;
  for (const event of events) {
    total_us += sanitizeMidiUs(event.delta.midi_us);
  }
  return total_us / 1000;
}

export function timedSong(song: Song): TimedSong {
  let time_ms: number = 0;
  const events: TimedSongEvent[] = song.events.map(event => {
    time_ms += sanitizeMidiUs(event.delta.midi_us) / 1000;

    const rv = { message: event.message, time_ms: time_ms };
    return rv;
  });
  return { start: song.start, events };
}

export function noteSong(timedSong: TimedSong): NoteSong {
  const events: NoteEvent[] = [];
  const pitchNotes: Record<number, NoteEvent> = {};
  const pedals: Record<number, NoteEvent> = {};
  function noteOn(time_ms: number, pitch: number, vel: number): void {
    pitchNotes[pitch] = { t: 'note', dur_ms: 0, pitch, vel, time_ms }
  }
  function noteOff(time_ms: number, pitch: number): void {
    const note = pitchNotes[pitch];
    note.dur_ms = time_ms - note.time_ms;
    events.push(note);
    delete pitchNotes[pitch];
  }
  timedSong.events.forEach(event => {
    switch (event.message[0]) {
      case 144: // note on
        if (event.message[2] == 0)
          noteOff(event.time_ms, event.message[1]);
        else
          noteOn(event.time_ms, event.message[1], event.message[2]);
        break;
      case 128: // note off
        noteOff(event.time_ms, event.message[1]);
        break;
      case 176: // controller
        if (event.message[2]) {
          pedals[event.message[1]] = { t: 'pedal', dur_ms: 0, time_ms: event.time_ms };
        }
        else {
          const pedal = pedals[event.message[1]];
          pedal.dur_ms = event.time_ms - pedal.time_ms;
          events.push(pedal);
          delete pedals[event.message[1]];
        }
        break;
      default:
        console.log(`unknown midi event ${event.message.join(", ")}`);
    }
  });
  return { start: timedSong.start, events };
}

// https://harmonizer.evilmartians.com/#fZNNb8IwDIb_i3etpny0CfQ2mHYal8Ft2iGUNK0oTZe2aAPx35egDZJOSm_xaz92XqdnOErT17qFHCfQyKNsesjfz9CKg4QcMEKQQKHbwYh-sEkI2WNl9EFAjh4RYRkjGbp97E9dig7ydmyaS3KDkQlsHrImKBJD0QmKcx-F8Yx7JJTGUOkExbIAxWlKPVh0qmyCyrCPIikLxuIxFJtOFXhF0ZUVA_CoQ2SGSbR8Ft0VwTywOLr2efwN4XDtiP5nfSRQjTJ4mG9yZ6GiVY09kcxrtzC6Pcm7yJAnrsZ-EMYrnfvqZjSfo657rxpTP2G9__a6Il96Oo3GqyNB25exqPpa3GVKkLtVL4ehbpW92flm0ErvZGNrRFe4gl1tZDHYP9TFbbhUG71Q8GfSb_Qgvmxoq5a60ea1VpX1GR7KsrxHn4XZuyC6rmOrrllr64Z7qG4_NmfdicLhOgqXyw8
export const pitchColor = [
  "#3e8aff", // C  blue
  "#003aba", // C# dark blue
  "#ff6b66", // D  red
  "#b28800", // Eb dark yellow
  "#ffc600", // E yellow
  "#f68000", // F orange
  "#763a00", // F# dark orange
  "#6eb200", // G green
  "#b100d1", // Ab dark magenta
  "#ea66ff", // A magenta
  "#00767d", // Bb dark cyan
  "#00b2bb", // B cyan
];

export const pitchName = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
