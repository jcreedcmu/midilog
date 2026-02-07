import { render } from 'preact';
import { useState } from 'preact/hooks';
import { pitchColor, Index, NoteSong, TimedSong, noteSong, timedSong, pitchName } from './song';
import { CanvasInfo, CanvasRef, useCanvas } from './use-canvas';
import { allNotesOff, getText, unreachable } from './util';

export type PlayCallback = (file: string, ix: number) => void;

// Try to ship off each note playback this
// many milliseconds before it's actually needed.

const PLAYBACK_ANTICIPATION_MS = 50;

export type AppProps = {
  index: Index,
  output: WebMidi.MIDIOutput,
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
  songIx: SongIx | undefined,
  song: TimedSong | undefined,
  nSong: NoteSong | undefined,
  playback: Playback | undefined,
};

export type Action =
  | { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], atTime_ms: number, newIx: number | undefined }
  | { t: 'panic' }
  | { t: 'idle' }
  | { t: 'pause' }
  | { t: 'resume' }
  ;

export type Dispatch = (action: Action) => void;
export type SongIx = { file: string, ix: number };

export function init(props: AppProps) {
  render(<App {...props} />, document.querySelector('.app') as any);
}

function renderIndex(index: Index, dispatch: Dispatch, cref: CanvasRef, currentSong: SongIx | undefined, playback: Playback | undefined): JSX.Element {
  const rows: JSX.Element[] = index.map(row => {
    const links: JSX.Element[] = [];
    for (let i = 0; i < row.lines; i++) {
      let backgroundColor = currentSong && currentSong.file == row.file && currentSong.ix == i ? 'yellow' : 'white';
      const button = <button
        style={{ cursor: 'pointer', backgroundColor, border: '1px solid #aaa', borderRadius: 4 }}
        onClick={() => { dispatch({ t: 'playFile', file: row.file, ix: i }); }}>
        {i}
      </button>;
      links.push(<td>{button}</td>);
    }
    return <tr><td>{row.file}</td> {links}</tr>;
  });
  const isPaused = playback?.pausedAt_ms !== undefined;
  const hasPlayback = playback !== undefined;
  rows.push(<tr><td>
    <button onClick={() => dispatch({ t: 'panic' })}>Panic</button>
    {hasPlayback && (
      <button
        style={{ marginLeft: 8 }}
        onClick={() => dispatch({ t: isPaused ? 'resume' : 'pause' })}>
        {isPaused ? 'Play' : 'Pause'}
      </button>
    )}
  </td></tr>);
  return <div><table>{rows}</table>
    <canvas
      ref={cref} style={{ width: '100%', height: `300px`, border: '1px solid black' }} />
  </div>;
}

function playNextNote(song: TimedSong, playhead: Playhead): Action {
  const { eventIndex, nowTime_ms } = playhead;

  const event = song.events[eventIndex];
  const newIx = eventIndex + 1 < song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

function _renderMainCanvas(ci: CanvasInfo, state: AppState) {
  const { d } = ci;
  const { playback } = state;

  const pixel_of_ms = 1 / 10;
  const pixel_of_pitch = 3;
  const vert_offset = 300;
  const [cw, ch] = [ci.size.x, ci.size.y];

  let playHeadPosition_px = 0;
  if (playback !== undefined) {
    playHeadPosition_px = (playback.playhead.fastNowTime_ms - playback.startTime_ms) * pixel_of_ms;
  }

  let xshift = 0;

  // if (playHeadPosition_px > cw / 2) { 
  xshift = cw / 2 - playHeadPosition_px;
  //}
  d.fillStyle = "#ddd";
  d.fillRect(0, 0, cw, ch);
  const fontHeight = 12;

  d.font = `bold ${fontHeight}px sans-serif`;
  d.textBaseline = 'middle';
  d.textAlign = 'right';
  if (state.nSong !== undefined) {
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        d.fillStyle = pitchColor[event.pitch % 12];
        d.fillRect(xshift + event.time_ms * pixel_of_ms, vert_offset - pixel_of_pitch * event.pitch, event.dur_ms * pixel_of_ms, pixel_of_pitch * 2);
      }
    });
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        d.fillStyle = 'black';
        d.fillText(pitchName[event.pitch % 12], xshift + event.time_ms * pixel_of_ms, 1 + vert_offset - pixel_of_pitch * (event.pitch - 1));

        d.fillStyle = pitchColor[event.pitch % 12];
        d.fillText(pitchName[event.pitch % 12], -1 + xshift + event.time_ms * pixel_of_ms, vert_offset - pixel_of_pitch * (event.pitch - 1));



      }
    });
  }

  if (playback !== undefined) {
    d.fillStyle = 'black';
    d.fillRect(xshift + playHeadPosition_px, 0, 2, ch);
  }
}

function App(props: AppProps): JSX.Element {
  const { index, output } = props;
  const [state, setState] = useState<AppState>({
    playback: undefined,
    song: undefined,
    nSong: undefined,
    songIx: undefined
  });
  const [cref, mc] = useCanvas(
    state, _renderMainCanvas,
    [state.playback?.playhead.fastNowTime_ms, state.playback, state.song],
    () => { }
  );

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song = timedSong(JSON.parse(lines[ix]));
    const nSong = noteSong(song);

    const startTime_ms = window.performance.now();
    const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime_ms, fastNowTime_ms: startTime_ms };
    const nextNoteAction = playNextNote(song, playhead);
    const timeoutId = window.setTimeout(() => dispatch(nextNoteAction), 0);

    setState(s => {
      return { song: song, nSong: nSong, songIx: { file, ix }, playback: { timeoutId, playhead, startTime_ms, pausedAt_ms: undefined } };
    });


  };

  const dispatch: Dispatch = (action) => {
    switch (action.t) {
      case 'playFile':
        playCallback(action.file, action.ix);
        break;
      case 'panic':
        if (state.playback !== undefined) {
          clearTimeout(state.playback.timeoutId);
          setState(s => {
            return { playback: undefined, song: undefined, songIx: undefined, nSong: undefined };
          });
        }
        allNotesOff(output);
        break;
      case 'none':
        break;
      case 'playNote':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          if (s.playback.pausedAt_ms !== undefined)
            return s; // Don't play notes if paused
          const { song, playback } = s;
          output.send(action.message, s.playback.startTime_ms + action.atTime_ms);
          if (action.newIx !== undefined) {
            playback.playhead.eventIndex = action.newIx;
            s = scheduleNextCallback(s, dispatch);
          }
          return { ...s };
        });
        break;
      case 'idle':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          if (s.playback.pausedAt_ms !== undefined)
            return s; // Don't schedule next callback if paused
          const { song, playback } = s;
          s = scheduleNextCallback(s, dispatch);
          return { ...s };
        });
        break;
      case 'pause':
        setState(s => {
          if (s.playback === undefined || s.playback.pausedAt_ms !== undefined)
            return s;
          allNotesOff(output);
          return {
            ...s,
            playback: {
              ...s.playback,
              pausedAt_ms: window.performance.now()
            }
          };
        });
        break;
      case 'resume':
        setState(s => {
          if (s.playback === undefined || s.playback.pausedAt_ms === undefined)
            return s;
          const now = window.performance.now();
          const pauseDuration = now - s.playback.pausedAt_ms;
          const newPlayback: Playback = {
            ...s.playback,
            startTime_ms: s.playback.startTime_ms + pauseDuration,
            pausedAt_ms: undefined
          };
          const newState = { ...s, playback: newPlayback };
          return scheduleNextCallback(newState, dispatch);
        });
        break;
      default:
        unreachable(action);
    }
  };
  return renderIndex(index, dispatch, cref, state.songIx, state.playback);
}

function scheduleNextCallback(s: AppState, dispatch: Dispatch): AppState {
  const { song, playback } = s;
  if (playback === undefined || song === undefined)
    return s;

  const newIx = playback.playhead.eventIndex;

  const delay = Math.max(0,
    playback.startTime_ms + song.events[newIx].time_ms - window.performance.now() - PLAYBACK_ANTICIPATION_MS);

  if (delay > PLAYBACK_ANTICIPATION_MS) {
    requestAnimationFrame(() => dispatch({ t: 'idle' }));
  } else {
    requestAnimationFrame(() => dispatch(playNextNote(song, playback.playhead)));
  }
  playback.playhead.fastNowTime_ms = window.performance.now();
  return s;
}
