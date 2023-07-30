export type Song = {
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

export type Index = { file: string, lines: number }[];

export function timedSong(song: Song): TimedSong {
  let time_ms: number = 0;
  const events: TimedSongEvent[] = song.events.map(event => {
    time_ms += event.delta.midi_us / 1000;

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
  console.log(events);
  return { start: timedSong.start, events };
}
