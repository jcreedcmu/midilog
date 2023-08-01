import { render } from 'preact';
import { useState } from 'preact/hooks';
import { pitchColor, Index, NoteSong, TimedSong, noteSong, timedSong } from './song';
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
};

export type AppState = {
  songIx: SongIx | undefined,
  song: TimedSong | undefined,
  nSong: NoteSong | undefined,
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
      ref={cref} style={{ width: '100%', height: `200px`, border: '1px solid black' }} />
  </div>;
}

function playNextNote(song: TimedSong, playhead: Playhead): Action {
  const { eventIndex, nowTime_ms } = playhead;

  const event = song.events[eventIndex];
  const newIx = eventIndex + 1 < song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

function _renderMainCanvas(ci: CanvasInfo, state: AppState) {
  console.log('rerender');
  const { d } = ci;
  const { playback } = state;

  const pixel_of_ms = 1 / 20;
  const pixel_of_pitch = 2;
  const vert_offset = 200;
  const [cw, ch] = [ci.size.x, ci.size.y];

  let playHeadPosition_px = 0;
  if (playback !== undefined) {
    playHeadPosition_px = (playback.playhead.fastNowTime_ms - playback.startTime_ms) * pixel_of_ms;
  }

  let xshift = 0;
  if (playHeadPosition_px > cw / 2) {
    xshift = cw / 2 - playHeadPosition_px;
  }
  d.fillStyle = "#eee";
  d.fillRect(0, 0, cw, ch);
  if (state.nSong !== undefined) {
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        d.fillStyle = pitchColor[event.pitch % 12];
        d.fillRect(xshift + event.time_ms * pixel_of_ms, vert_offset - pixel_of_pitch * event.pitch, event.dur_ms * pixel_of_ms, pixel_of_pitch * 2);
      }
    });
  }

  if (playback !== undefined) {
    d.fillStyle = 'black';
    console.log('playHead', playHeadPosition_px);
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
  console.log('app render', state.playback?.playhead.eventIndex);
  const [cref, mc] = useCanvas(
    state, _renderMainCanvas,
    [state.playback?.playhead.eventIndex, state.playback, state.song],
    () => { }
  );

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song = timedSong(JSON.parse(lines[ix]));
    const nSong = noteSong(song);

    const startTime_ms = window.performance.now();
    const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime_ms, fastNowTime_ms: startTime_ms };
    const nextNoteAction = playNextNote(song, playhead);
    console.log('set timeout', file, ix, nextNoteAction);
    const timeoutId = window.setTimeout(() => dispatch(nextNoteAction), 0);

    setState(s => {
      return { song: song, nSong: nSong, songIx: { file, ix }, playback: { timeoutId, playhead, startTime_ms } };
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
          const { song, playback } = s;
          console.log('sending', action.atTime_ms);
          output.send(action.message, s.playback.startTime_ms + action.atTime_ms);
          if (action.newIx !== undefined) {
            const delay = Math.max(0,
              s.playback.startTime_ms + s.song.events[action.newIx].time_ms
              - window.performance.now() - PLAYBACK_ANTICIPATION_MS);
            s.playback.playhead.eventIndex = action.newIx;
            setTimeout(() => dispatch(playNextNote(song, playback.playhead)), delay);
          }
          s.playback.playhead.fastNowTime_ms = window.performance.now();
          return { ...s };
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
