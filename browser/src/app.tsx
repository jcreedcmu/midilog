import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { pitchColor, Index, NoteSong, TimedSong, noteSong, timedSong, pitchName, SongEvent } from './song';
import { CanvasInfo, CanvasRef, useCanvas } from './use-canvas';
import { getText, unreachable } from './util';
import { AudioOutput, OutputMode, send, allNotesOff, setMode } from './audio-output';

export type PlayCallback = (file: string, ix: number) => void;

// Try to ship off each note playback this
// many milliseconds before it's actually needed.

const PLAYBACK_ANTICIPATION_MS = 50;

export type InitProps = {
  index: Index,
  output: AudioOutput,
  onSave: (events: SongEvent[]) => Promise<void>,
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
  songIx: SongIx | undefined,
  song: TimedSong | undefined,
  nSong: NoteSong | undefined,
  playback: Playback | undefined,
  pendingEvents: SongEvent[],
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
  | { t: 'addPendingEvent', event: SongEvent }
  | { t: 'clearPendingEvents' }
  | { t: 'setOutputMode', mode: OutputMode }
  ;

export type Dispatch = (action: Action) => void;
export type SongIx = { file: string, ix: number };

export function init(props: InitProps): AppHandle {
  const dispatchRef: { current: Dispatch | null } = { current: null };
  const root = createRoot(document.querySelector('.app')!);
  root.render(<App {...props} dispatchRef={dispatchRef} />);
  return {
    dispatch: (action: Action) => {
      if (dispatchRef.current) {
        dispatchRef.current(action);
      }
    }
  };
}

// Icons as simple SVG components
function FolderIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#fff' : '#888'}>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  );
}

function RecordIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#fff' : '#888'}>
      <circle cx="12" cy="12" r="8" fill={active ? '#f44' : '#844'}/>
    </svg>
  );
}

function PianoIcon({ active }: { active: boolean }) {
  const color = active ? '#fff' : '#888';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      {/* White keys */}
      <rect x="2" y="6" width="4" height="12" fill={color} stroke={active ? '#666' : '#555'} strokeWidth="0.5"/>
      <rect x="6" y="6" width="4" height="12" fill={color} stroke={active ? '#666' : '#555'} strokeWidth="0.5"/>
      <rect x="10" y="6" width="4" height="12" fill={color} stroke={active ? '#666' : '#555'} strokeWidth="0.5"/>
      <rect x="14" y="6" width="4" height="12" fill={color} stroke={active ? '#666' : '#555'} strokeWidth="0.5"/>
      <rect x="18" y="6" width="4" height="12" fill={color} stroke={active ? '#666' : '#555'} strokeWidth="0.5"/>
      {/* Black keys */}
      <rect x="5" y="6" width="2.5" height="7" fill={active ? '#333' : '#555'}/>
      <rect x="9" y="6" width="2.5" height="7" fill={active ? '#333' : '#555'}/>
      <rect x="16.5" y="6" width="2.5" height="7" fill={active ? '#333' : '#555'}/>
    </svg>
  );
}

type CanvasHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

// Sidebar icon button
function SidebarButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#444' : 'transparent',
        border: 'none',
        padding: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {icon}
    </button>
  );
}

// Files panel
function FilesPanel({ index, dispatch, currentSong }: { index: Index, dispatch: Dispatch, currentSong: SongIx | undefined }) {
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#666' }}>Recordings</h3>
      {index.map(row => (
        <div key={row.file} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{row.file}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from({ length: row.lines }, (_, i) => {
              const isActive = currentSong && currentSong.file === row.file && currentSong.ix === i;
              return (
                <button
                  key={i}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: isActive ? '#4a9eff' : '#e0e0e0',
                    color: isActive ? '#fff' : '#333',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 12,
                  }}
                  onClick={() => dispatch({ t: 'playFile', file: row.file, ix: i })}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Recording panel
function RecordingPanel({ pendingEvents, onSave, onDiscard }: { pendingEvents: SongEvent[], onSave: () => void, onDiscard: () => void }) {
  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#666' }}>Recording</h3>
      <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        {pendingEvents.length} <span style={{ fontSize: 14, fontWeight: 'normal', color: '#888' }}>events</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSave}
          disabled={pendingEvents.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: pendingEvents.length > 0 ? '#4caf50' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: pendingEvents.length > 0 ? 'pointer' : 'default',
          }}
        >
          Save
        </button>
        <button
          onClick={onDiscard}
          disabled={pendingEvents.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: pendingEvents.length > 0 ? '#f44336' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: pendingEvents.length > 0 ? 'pointer' : 'default',
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// Settings panel
function SettingsPanel({ outputMode, hasMidi, dispatch }: { outputMode: OutputMode, hasMidi: boolean, dispatch: Dispatch }) {
  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#666' }}>MIDI Settings</h3>
      <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>Output Device</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => dispatch({ t: 'setOutputMode', mode: 'software' })}
          style={{
            padding: '8px 12px',
            backgroundColor: outputMode === 'software' ? '#4a9eff' : '#e0e0e0',
            color: outputMode === 'software' ? '#fff' : '#333',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Software Synth
        </button>
        <button
          onClick={() => dispatch({ t: 'setOutputMode', mode: 'midi' })}
          disabled={!hasMidi}
          style={{
            padding: '8px 12px',
            backgroundColor: outputMode === 'midi' ? '#4a9eff' : '#e0e0e0',
            color: outputMode === 'midi' ? '#fff' : '#333',
            border: 'none',
            borderRadius: 4,
            cursor: hasMidi ? 'pointer' : 'default',
            textAlign: 'left',
            opacity: hasMidi ? 1 : 0.5,
          }}
        >
          MIDI Device {!hasMidi && '(not connected)'}
        </button>
      </div>
    </div>
  );
}

function playNextNote(song: TimedSong, playhead: Playhead): Action {
  const { eventIndex, nowTime_ms } = playhead;

  const event = song.events[eventIndex];
  const newIx = eventIndex + 1 < song.events.length ? eventIndex + 1 : undefined;
  return { t: 'playNote', message: event.message, atTime_ms: event.time_ms, newIx };
}

function findEventIndexAtTime(song: TimedSong, time_ms: number): number {
  for (let i = 0; i < song.events.length; i++) {
    if (song.events[i].time_ms >= time_ms) {
      return i;
    }
  }
  return song.events.length - 1;
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
  const { index, output, onSave, dispatchRef } = props;
  const [state, setState] = useState<AppState>({
    playback: undefined,
    song: undefined,
    nSong: undefined,
    songIx: undefined,
    pendingEvents: []
  });
  const [activePanel, setActivePanel] = useState<SidebarPanel>('files');
  const [cref, mc] = useCanvas(
    state, _renderMainCanvas,
    [state.playback?.playhead.fastNowTime_ms, state.playback, state.song],
    () => { }
  );

  const playCallback: PlayCallback = async (file, ix) => {
    // Silence any currently playing notes before loading new song
    allNotesOff(output);

    const lines = (await getText(`/log/${file}`)).split('\n');
    const song = timedSong(JSON.parse(lines[ix]));
    const nSong = noteSong(song);

    const startTime_ms = window.performance.now();
    const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime_ms, fastNowTime_ms: startTime_ms };

    // Load in paused state - user must click Play to start
    setState(s => {
      return { ...s, song: song, nSong: nSong, songIx: { file, ix }, playback: { timeoutId: 0, playhead, startTime_ms, pausedAt_ms: startTime_ms } };
    });
  };

  const dispatch: Dispatch = (action) => {
    switch (action.t) {
      case 'playFile':
        playCallback(action.file, action.ix);
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
          send(output, action.message, s.playback.startTime_ms + action.atTime_ms);
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
      case 'seek':
        setState(s => {
          if (s.playback === undefined || s.song === undefined || s.playback.pausedAt_ms === undefined)
            return s; // Only allow seeking when paused
          const { playback, song } = s;
          const currentPosition = playback.playhead.fastNowTime_ms - playback.startTime_ms;
          const songDuration = song.events[song.events.length - 1].time_ms;
          const newPosition = Math.max(0, Math.min(songDuration, currentPosition + action.delta_ms));
          const actualDelta = newPosition - currentPosition;
          const newEventIndex = findEventIndexAtTime(song, newPosition);
          return {
            ...s,
            playback: {
              ...playback,
              startTime_ms: playback.startTime_ms - actualDelta,
              playhead: {
                ...playback.playhead,
                eventIndex: newEventIndex
              }
            }
          };
        });
        break;
      case 'addPendingEvent':
        setState(s => ({ ...s, pendingEvents: [...s.pendingEvents, action.event] }));
        break;
      case 'clearPendingEvents':
        setState(s => ({ ...s, pendingEvents: [] }));
        break;
      case 'setOutputMode':
        setMode(output, action.mode);
        setState(s => ({ ...s })); // Force re-render to update UI
        break;
      default:
        unreachable(action);
    }
  };

  // Expose dispatch to parent
  dispatchRef.current = dispatch;

  const handleSave = async () => {
    await onSave(state.pendingEvents);
    dispatch({ t: 'clearPendingEvents' });
  };

  const handleDiscard = () => {
    dispatch({ t: 'clearPendingEvents' });
  };

  const dragRef = useRef<{ startX: number, didDrag: boolean } | null>(null);
  const MS_PER_PIXEL = 10; // inverse of pixel_of_ms = 1/10

  const canvasHandlers: CanvasHandlers = {
    onPointerDown: (e: PointerEvent) => {
      dragRef.current = { startX: e.clientX, didDrag: false };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragRef.current === null) return;
      const deltaX = e.clientX - dragRef.current.startX;
      if (deltaX !== 0) {
        dragRef.current.didDrag = true;
        dispatch({ t: 'seek', delta_ms: -deltaX * MS_PER_PIXEL });
        dragRef.current.startX = e.clientX;
      }
    },
    onPointerUp: (e: PointerEvent) => {
      if (dragRef.current !== null && !dragRef.current.didDrag && state.playback !== undefined) {
        const isPaused = state.playback.pausedAt_ms !== undefined;
        dispatch({ t: isPaused ? 'resume' : 'pause' });
      }
      dragRef.current = null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Navbar */}
      <div style={{
        backgroundColor: '#222',
        color: '#fff',
        padding: '12px 16px',
        fontSize: 18,
        fontWeight: 'bold',
        flexShrink: 0,
      }}>
        MIDI notebook
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar icons */}
        <div style={{
          backgroundColor: '#333',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <SidebarButton
            icon={<FolderIcon active={activePanel === 'files'} />}
            active={activePanel === 'files'}
            onClick={() => setActivePanel('files')}
          />
          <SidebarButton
            icon={<RecordIcon active={activePanel === 'recording'} />}
            active={activePanel === 'recording'}
            onClick={() => setActivePanel('recording')}
          />
          <SidebarButton
            icon={<PianoIcon active={activePanel === 'settings'} />}
            active={activePanel === 'settings'}
            onClick={() => setActivePanel('settings')}
          />
        </div>

        {/* Sidebar panel */}
        <div style={{
          width: 250,
          backgroundColor: '#f5f5f5',
          borderRight: '1px solid #ddd',
          flexShrink: 0,
          overflowY: 'auto',
        }}>
          {activePanel === 'files' && (
            <FilesPanel index={index} dispatch={dispatch} currentSong={state.songIx} />
          )}
          {activePanel === 'recording' && (
            <RecordingPanel pendingEvents={state.pendingEvents} onSave={handleSave} onDiscard={handleDiscard} />
          )}
          {activePanel === 'settings' && (
            <SettingsPanel outputMode={output.mode} hasMidi={output.midiOutput !== null} dispatch={dispatch} />
          )}
        </div>

        {/* Piano roll canvas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <canvas
            ref={cref}
            style={{
              width: '100%',
              height: '100%',
              touchAction: 'none',
              cursor: 'pointer',
            }}
            onPointerDown={canvasHandlers.onPointerDown}
            onPointerMove={canvasHandlers.onPointerMove}
            onPointerUp={canvasHandlers.onPointerUp}
            onPointerLeave={canvasHandlers.onPointerUp}
          />
        </div>
      </div>
    </div>
  );
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
