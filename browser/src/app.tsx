import { render } from 'preact';
import { useState } from 'preact/hooks';
import { allNotesOff, getText, unreachable } from './util';
import { Index, Song, TimedSong, timedSong } from './types';

export type PlayCallback = (file: string, ix: number) => void;

// Try to ship off each note playback this
// many milliseconds before it's actually needed.

const PLAYBACK_ANTICIPATION_MS = 50;

export type AppProps = {
  index: Index,
  output: WebMidi.MIDIOutput,
};

export type AppState = {
  song: TimedSong | undefined, playback: {
    timeoutId: number,
    eventIndex: number,
    startTime: DOMHighResTimeStamp,
    nowTime_ms: DOMHighResTimeStamp,
  } | undefined
};

export type Action =
  { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], atTime_ms: number, newIx: number | undefined }
  | { t: 'panic' }
  ;

export type Dispatch = (action: Action) => void;

function renderIndex(index: Index, dispatch: Dispatch): JSX.Element {
  const rows: JSX.Element[] = index.map(row => {
    const links: JSX.Element[] = [];
    for (let i = 0; i < row.lines; i++) {
      const button = <button
        style={{ cursor: 'pointer' }}
        onClick={() => { dispatch({ t: 'playFile', file: row.file, ix: i }); }}>
        {i}
      </button>;
      links.push(<td>{button}</td>);
    }
    return <tr><td>{row.file}</td> {links}</tr>;
  });
  rows.push(<tr><td><button onClick={() => dispatch({ t: 'panic' })}>Panic</button></td></tr>);
  return <table>{rows}</table>;
}

function playNextNote(state: AppState): Action {
  if (state.playback === undefined)
    return { t: 'none' };
  if (state.song === undefined)
    return { t: 'none' };

  const { eventIndex, nowTime_ms } = state.playback;

  const event = state.song.events[eventIndex];
  const newIx = eventIndex + 1 < state.song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

function App(props: AppProps): JSX.Element {
  const { index, output } = props;
  const [state, setState] = useState<AppState>({ playback: undefined, song: undefined });

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song = timedSong(JSON.parse(lines[ix]));

    const startTime = window.performance.now();
    const timeoutId = window.setTimeout(() => dispatch(playNextNote(state)), 0);
    setState(s => { s.song = song; s.playback = { timeoutId, eventIndex: 0, startTime, nowTime_ms: startTime }; return s; });


  };

  const dispatch: Dispatch = (action) => {
    switch (action.t) {
      case 'playFile':
        playCallback(action.file, action.ix);
        break;
      case 'panic':
        setState(s => {
          s.playback = undefined;
          return s;
        });
        allNotesOff(output);
        break;
      case 'none':
        break;
      case 'playNote':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          console.log('sending', action.atTime_ms);
          output.send(action.message, s.playback.startTime + action.atTime_ms);
          if (action.newIx !== undefined) {
            const delay = Math.max(0,
              s.playback.startTime + s.song.events[action.newIx].time_ms
              - window.performance.now() - PLAYBACK_ANTICIPATION_MS);
            s.playback.eventIndex = action.newIx;
            setTimeout(() => dispatch(playNextNote(s)), delay);
          }
          return s;
        });
        break;
      default:
        unreachable(action);
    }
  };
  return renderIndex(index, dispatch);
}

export function init(props: AppProps) {
  render(<App {...props} />, document.querySelector('.app') as any);
}
