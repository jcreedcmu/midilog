import { render } from 'preact';
import { Index, Song } from './logger';

export type PlayCallback = (file: string, ix: number) => void;

export type AppProps = { index: Index, playCallback: PlayCallback };

function renderIndex(index: Index, playCallback: PlayCallback): JSX.Element {
  const rows: JSX.Element[] = index.map(row => {
    const links: JSX.Element[] = [];
    for (let i = 0; i < row.lines; i++) {
      const button = <button
        style={{ cursor: 'pointer' }}
        onClick={() => { playCallback(row.file, i); }}>
        {i}
      </button>;
      links.push(<td>{button}</td>);
    }
    return <tr><td>{row.file}</td> {links}</tr>;
  });
  return <table>{rows}</table>;
}

function App(props: AppProps): JSX.Element {
  return renderIndex(props.index, props.playCallback);
}


export function init(props: AppProps) {
  render(<App {...props} />, document.querySelector('.app') as any);
}
