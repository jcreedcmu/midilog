import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { allNotesOff, getText, unreachable } from './util';
import { Index, Song, TimedSong, timedSong } from './types';
import { CanvasInfo, CanvasRef, useCanvas } from './use-canvas';

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
};

export type Playback = {
  timeoutId: number,
  playhead: Playhead,
  startTime: DOMHighResTimeStamp,
};

export type AppState = {
  songIx: SongIx | undefined,
  song: TimedSong | undefined,
  playback: Playback | undefined,
};

export type Action =
  { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], atTime_ms: number, newIx: number | undefined }
  | { t: 'panic' }
  ;

export type Dispatch = (action: Action) => void;
export type SongIx = { file: string, ix: number };

function renderIndex(index: Index, dispatch: Dispatch, cref: CanvasRef, currentSong: SongIx | undefined): JSX.Element {
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
  rows.push(<tr><td><button onClick={() => dispatch({ t: 'panic' })}>Panic</button></td></tr>);
  return <div><table>{rows}</table>
    <canvas
      ref={cref} style={{ width: '100%', height: '200px', border: '1px solid black' }} />
  </div>;
}

function playNextNote(song: TimedSong, playhead: Playhead): Action {
  // if (state.playback === undefined)
  //   return { t: 'none' };
  // if (state.song === undefined)
  //   return { t: 'none' };

  const { eventIndex, nowTime_ms } = playhead;

  const event = song.events[eventIndex];
  const newIx = eventIndex + 1 < song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

function _renderMainCanvas(ci: CanvasInfo, state: AppState) {
  ci.d.clearRect(0, 0, ci.size.x, ci.size.y);
  if (state.song !== undefined) {
    state.song.events.forEach(event => {
      ci.d.fillRect(event.time_ms / 10, 10, 10, 10);
    });
  }
}

function App(props: AppProps): JSX.Element {
  const { index, output } = props;
  const [state, setState] = useState<AppState>({ playback: undefined, song: undefined, songIx: undefined });
  const [cref, mc] = useCanvas(
    state, _renderMainCanvas,
    [state.playback, state.song],
    () => { }
  );

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song = timedSong(JSON.parse(lines[ix]));

    const startTime = window.performance.now();
    const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime };
    const nextNoteAction = playNextNote(song, playhead);
    console.log('set timeout', file, ix, nextNoteAction);
    const timeoutId = window.setTimeout(() => dispatch(nextNoteAction), 0);

    setState(s => {
      return { song: song, songIx: { file, ix }, playback: { timeoutId, playhead, startTime } };
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
            return { playback: undefined, song: undefined, songIx: undefined };
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
          const { song, playback } = s;
          console.log('sending', action.atTime_ms);
          output.send(action.message, s.playback.startTime + action.atTime_ms);
          if (action.newIx !== undefined) {
            const delay = Math.max(0,
              s.playback.startTime + s.song.events[action.newIx].time_ms
              - window.performance.now() - PLAYBACK_ANTICIPATION_MS);
            s.playback.playhead.eventIndex = action.newIx;
            setTimeout(() => dispatch(playNextNote(song, playback.playhead)), delay);
          }
          return s;
        });
        break;
      default:
        unreachable(action);
    }
  };
  return renderIndex(index, dispatch, cref, state.songIx);
}

export function init(props: AppProps) {
  render(<App {...props} />, document.querySelector('.app') as any);
}
