export type Song = {
  start: string, // date
  events: SongEvent[],
};

export type SongEvent = {
  message: number[],
  delta: {
    midi_us: number,
    wall_ms: number,
  }
}

export type Index = { file: string, lines: number }[];
