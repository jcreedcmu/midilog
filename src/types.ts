import { NoteSong, Song, SongEntry, TimedSong, SongEvent, Tag } from './song';
import { AudioOutput, OutputMode } from './audio-output';

export type PlayCallback = (file: string, ix: number) => void;

export const PLAYBACK_ANTICIPATION_MS = 50;

export type InitProps = {
  songs: SongEntry[],
  output: AudioOutput,
  onSave: () => void,
};

export type AppProps = InitProps & {
  dispatchRef: { current: Dispatch | null },
};

export type AppHandle = {
  dispatch: Dispatch,
};

export type Playhead = {
  eventIndex: number,
  nowTime_ms: DOMHighResTimeStamp,
  fastNowTime_ms: DOMHighResTimeStamp,
};

export type Playback = {
  timeoutId: number,
  playhead: Playhead,
  startTime_ms: DOMHighResTimeStamp,
  pausedAt_ms: DOMHighResTimeStamp | undefined,  // undefined = playing, number = paused
};

export type AppState = {
  songs: SongEntry[],
  songIx: SongIx | undefined,
  rawSong: Song | undefined,
  song: TimedSong | undefined,
  nSong: NoteSong | undefined,
  playback: Playback | undefined,
  pendingEvents: SongEvent[],
  pendingTag: Tag | undefined,
  pixelPerMs: number,
  speed: number,
  autoSave: boolean,
};

export type SidebarPanel = 'files' | 'recording' | 'settings';

export type Action =
  | { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], atTime_ms: number, newIx: number | undefined }
  | { t: 'idle' }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'seek', delta_ms: number }
  | { t: 'seekToStart' }
  | { t: 'seekToEnd' }
  | { t: 'addPendingEvent', event: SongEvent }
  | { t: 'clearPendingEvents' }
  | { t: 'setOutputMode', mode: OutputMode }
  | { t: 'addTag', tag: Tag }
  | { t: 'moveTag', index: number, tag: Tag }
  | { t: 'renameTag', index: number, label: string }
  | { t: 'removeTag', index: number }
  | { t: 'seekToTime', time_ms: number }
  | { t: 'deleteEntry', file: string, ix: number }
  | { t: 'undeleteEntry', file: string, ix: number }
  | { t: 'toggleAutoSave' }
  ;

export type Dispatch = (action: Action) => void;
export type SongIx = { file: string, ix: number };

export type CanvasHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onWheel: (e: WheelEvent) => void;
  onDoubleClick: (e: MouseEvent) => void;
};

export type EditingTag = {
  index: number;
  cssX: number;   // left position relative to canvas
  cssW: number;    // width in css pixels
};

export function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function playNextNote(song: TimedSong, playhead: Playhead): Action {
  const { eventIndex, nowTime_ms } = playhead;

  const event = song.events[eventIndex];
  const newIx = eventIndex + 1 < song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

export function findEventIndexAtTime(song: TimedSong, time_ms: number): number {
  for (let i = 0; i < song.events.length; i++) {
    if (song.events[i].time_ms >= time_ms) {
      return i;
    }
  }
  return song.events.length - 1;
}

export function scheduleNextCallback(s: AppState, dispatch: Dispatch): AppState {
  const { song, playback } = s;
  if (playback === undefined || song === undefined)
    return s;

  const now = window.performance.now();
  playback.playhead.fastNowTime_ms = now;

  const newIx = playback.playhead.eventIndex;

  // Past last event — keep animating until playhead reaches song end, then pause
  if (newIx >= song.events.length) {
    const songEnd_ms = song.events[song.events.length - 1].time_ms;
    const position_ms = (now - playback.startTime_ms) * s.speed;
    if (position_ms >= songEnd_ms) {
      const endWallTime = playback.startTime_ms + songEnd_ms / s.speed;
      playback.pausedAt_ms = endWallTime;
      playback.playhead.fastNowTime_ms = endWallTime;
      return s;
    }
    requestAnimationFrame(() => dispatch({ t: 'idle' }));
    return s;
  }

  const delay = Math.max(0,
    playback.startTime_ms + song.events[newIx].time_ms / s.speed - now - PLAYBACK_ANTICIPATION_MS);

  if (delay > PLAYBACK_ANTICIPATION_MS) {
    requestAnimationFrame(() => dispatch({ t: 'idle' }));
  } else {
    requestAnimationFrame(() => dispatch(playNextNote(song, playback.playhead)));
  }
  return s;
}
