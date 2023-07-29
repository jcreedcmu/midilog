import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Index, Song } from './logger';
import { getText } from './util';

export type PlayCallback = (file: string, ix: number) => void;

export type AppProps = {
  index: Index,
  output: WebMidi.MIDIOutput,
};

export type AppState = {
  song: Song | undefined, playback: { startTime: number } | undefined
};

export type Action =
  | { t: 'playFile', file: string, ix: number };

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
  return <table>{rows}</table>;
}

function App(props: AppProps): JSX.Element {

  const playCallback: PlayCallback = async (file, ix) => {
    const lines = (await getText(`/log/${file}`)).split('\n');
    const song: Song = JSON.parse(lines[ix]);
    const t = window.performance.now();
    let tp = t;
    song.events.forEach(event => {
      tp += event.delta.midi_us / 1000;
      props.output.send(event.message, tp);
    });
  };

  const [state, setState] = useState<AppState>({ playback: undefined, song: undefined });
  const dispatch: Dispatch = (action) => {
    switch (action.t) {
      case 'playFile':
        playCallback(action.file, action.ix);
        break;
    }
  };
  return renderIndex(props.index, dispatch);
}

export function init(props: AppProps) {
  render(<App {...props} />, document.querySelector('.app') as any);
}
