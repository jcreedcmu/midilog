import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Index, Song } from './logger';
import { allNotesOff, getText, unreachable } from './util';

export type PlayCallback = (file: string, ix: number) => void;

// Try to ship off each note playback this
// many milliseconds before it's actually needed.

const PLAYBACK_ANTICIPATION_MS = 50;

export type AppProps = {
  index: Index,
  output: WebMidi.MIDIOutput,
};

export type AppState = {
  song: Song | undefined, playback: {
    timeoutId: number,
    eventIndex: number,
    startTime: DOMHighResTimeStamp,
    nowTime_ms: DOMHighResTimeStamp,
  } | undefined
};

export type Action =
  { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], newTime_ms: number, newIx: number | undefined }
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
  return { t: 'playNote', message: event.message, newTime_ms: nowTime_ms + event.delta.midi_us / 1000, newIx };
}

function App(props: AppProps): JSX.Element {
  const { index, output } = props;
  const [state, setState] = useState<AppState>({ playback: undefined, song: undefined });

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song: Song = JSON.parse(lines[ix]);

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
        allNotesOff(output);
        break;
      case 'none':
        break;
      case 'playNote':
        setState(s => {
          if (s.playback === undefined)
            return s;
          console.log('should be positive: ', s.playback.nowTime_ms - window.performance.now());
          output.send(action.message, s.playback.nowTime_ms);
          if (action.newIx != undefined) {
            s.playback.eventIndex = action.newIx;
            s.playback.nowTime_ms = action.newTime_ms;
            //            const delay = Math.max(0, action.newTime_ms - window.performance.now() - PLAYBACK_ANTICIPATION_MS);
            const delay = 0;
            console.log(delay);
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
