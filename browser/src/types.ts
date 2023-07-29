export type Song = {
  start: string, // date
  events: SongEvent[],
};

export type TimedSong = {
  start: string, // date
  events: TimedSongEvent[],
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
