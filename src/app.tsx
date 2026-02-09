import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { Index, TimedSong, noteSong, timedSong, SongEvent, Tag } from './song';
import { useCanvas } from './use-canvas';
import { getText, unreachable } from './util';
import { AudioOutput, OutputMode, send, allNotesOff, setMode } from './audio-output';
import { renderMainCanvas, TAG_LANE_TOP, TAG_LANE_BOTTOM } from './render-canvas';
import {
  AppState, AppProps, AppHandle, InitProps, Action, Dispatch, SongIx,
  SidebarPanel, Playhead, Playback, CanvasHandlers,
  cx, formatDuration, findEventIndexAtTime, scheduleNextCallback,
} from './types';

export type { AppHandle, InitProps, Action, Dispatch };

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

// Icon component that loads from SVG files
function Icon({ src, active }: { src: string, active: boolean }) {
  return (
    <img
      src={src}
      width={24}
      height={24}
      style={{
        opacity: active ? 1 : 0.5,
      }}
    />
  );
}

// Sidebar icon button
function SidebarButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('sidebar-button', active && 'active')}>
      {icon}
    </button>
  );
}

// Files panel
function FilesPanel({ index, dispatch, currentSong }: { index: Index, dispatch: Dispatch, currentSong: SongIx | undefined }) {
  const rows: { file: string, ix: number, duration_ms: number }[] = [];
  for (const row of index) {
    for (let i = 0; i < row.lines; i++) {
      rows.push({ file: row.file, ix: i, duration_ms: row.durations_ms[i] });
    }
  }
  return (
    <div className="files-panel">
      <h3 className="panel-header">Entries</h3>
      <div className="files-scroll">
        <table className="files-table">
          <thead>
            <tr><th>date</th><th>#</th><th>dur</th></tr>
          </thead>
          <tbody>
            {rows.map(({ file, ix, duration_ms }) => {
              const isActive = currentSong && currentSong.file === file && currentSong.ix === ix;
              return (
                <tr
                  key={`${file}-${ix}`}
                  className={cx('files-row', isActive && 'active')}
                  onClick={() => dispatch({ t: 'playFile', file, ix })}
                >
                  <td>{file.replace(/\.json$/, '')}</td>
                  <td>{ix}</td>
                  <td>{formatDuration(duration_ms)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Recording panel
function RecordingPanel({ pendingEvents, onSave, onDiscard }: { pendingEvents: SongEvent[], onSave: () => void, onDiscard: () => void }) {
  return (
    <div className="panel-content">
      <h3 className="panel-header">Recording</h3>
      <div className="event-count">
        {pendingEvents.length} <span className="event-count-label">events</span>
      </div>
      <div className="button-row">
        <button onClick={onSave} disabled={pendingEvents.length === 0} className="btn btn-save">
          Save
        </button>
        <button onClick={onDiscard} disabled={pendingEvents.length === 0} className="btn btn-discard">
          Discard
        </button>
      </div>
    </div>
  );
}

// Settings panel
function SettingsPanel({ outputMode, hasMidi, dispatch }: { outputMode: OutputMode, hasMidi: boolean, dispatch: Dispatch }) {
  return (
    <div className="panel-content">
      <h3 className="panel-header">MIDI Settings</h3>
      <div className="settings-label">Output Device</div>
      <div className="settings-buttons">
        <button
          onClick={() => dispatch({ t: 'setOutputMode', mode: 'software' })}
          className={cx('settings-button', outputMode === 'software' && 'active')}
        >
          Software Synth
        </button>
        <button
          onClick={() => dispatch({ t: 'setOutputMode', mode: 'midi' })}
          disabled={!hasMidi}
          className={cx('settings-button', outputMode === 'midi' && 'active')}
        >
          MIDI Device {!hasMidi && '(not connected)'}
        </button>
      </div>
    </div>
  );
}

function App(props: AppProps): JSX.Element {
  const { index, output, onSave, dispatchRef } = props;
  const [state, setState] = useState<AppState>({
    playback: undefined,
    song: undefined,
    nSong: undefined,
    songIx: undefined,
    pendingEvents: [],
    pendingTag: undefined,
    pixelPerMs: 1 / 10,
  });
  const [activePanel, setActivePanel] = useState<SidebarPanel | null>('files');
  const togglePanel = (panel: SidebarPanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };
  const [cref, mc] = useCanvas(
    state, renderMainCanvas,
    [state.playback?.playhead.fastNowTime_ms, state.playback, state.song, state.song?.tags, state.pendingTag, state.pixelPerMs],
    () => { }
  );

  const playCallback = async (file: string, ix: number) => {
    // Silence any currently playing notes before loading new song
    allNotesOff(output);

    const lines = (await getText(`/log/${file}`)).split('\n');
    const raw = JSON.parse(lines[ix]);
    const song = timedSong(raw);
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
      case 'seekToStart':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          allNotesOff(output);
          const now = window.performance.now();
          return {
            ...s,
            playback: {
              ...s.playback,
              startTime_ms: now,
              pausedAt_ms: now,
              playhead: { eventIndex: 0, nowTime_ms: now, fastNowTime_ms: now }
            }
          };
        });
        break;
      case 'seekToEnd':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          allNotesOff(output);
          const now = window.performance.now();
          const songDuration = s.song.events[s.song.events.length - 1].time_ms;
          return {
            ...s,
            playback: {
              ...s.playback,
              startTime_ms: now - songDuration,
              pausedAt_ms: now,
              playhead: {
                eventIndex: s.song.events.length - 1,
                nowTime_ms: now,
                fastNowTime_ms: now
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
      case 'addTag':
        setState(s => {
          if (!s.song) return s;
          const tags = [...(s.song.tags || []), action.tag];
          return { ...s, song: { ...s.song, tags } };
        });
        break;
      case 'moveTag':
        setState(s => {
          if (!s.song?.tags) return s;
          const tags = s.song.tags.map((t, i) => i === action.index ? action.tag : t);
          return { ...s, song: { ...s.song, tags } };
        });
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
  type TagDrag =
    | { mode: 'create', startTime_ms: number }
    | { mode: 'move', index: number, grabOffset_ms: number, tag: Tag };
  const tagDragRef = useRef<TagDrag | null>(null);
  const msPerPixel = 1 / state.pixelPerMs;

  function canvasXToTime(cssX: number): number {
    if (!state.playback || !mc.current) return 0;
    const cw = mc.current.size.x;
    const playHeadPosition_px = (state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms) * state.pixelPerMs;
    const xshift = cw / 2 - playHeadPosition_px;
    return (cssX - xshift) * msPerPixel;
  }

  function findTagAtTime(time_ms: number): number {
    const tags = state.song?.tags;
    if (!tags) return -1;
    for (let i = tags.length - 1; i >= 0; i--) {
      if (time_ms >= tags[i].start_ms && time_ms <= tags[i].end_ms) return i;
    }
    return -1;
  }

  const canvasHandlers: CanvasHandlers = {
    onPointerDown: (e: PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      const rect = (e.target as Element).getBoundingClientRect();
      const cssY = e.clientY - rect.top;
      const cssX = e.clientX - rect.left;

      if (cssY >= TAG_LANE_TOP && cssY < TAG_LANE_BOTTOM && state.playback) {
        const time_ms = canvasXToTime(cssX);
        const hitIndex = findTagAtTime(time_ms);
        if (hitIndex >= 0) {
          const tag = state.song!.tags![hitIndex];
          tagDragRef.current = { mode: 'move', index: hitIndex, grabOffset_ms: time_ms - tag.start_ms, tag };
        } else {
          tagDragRef.current = { mode: 'create', startTime_ms: time_ms };
        }
      } else {
        dragRef.current = { startX: e.clientX, didDrag: false };
      }
    },
    onPointerMove: (e: PointerEvent) => {
      if (tagDragRef.current !== null) {
        const rect = (e.target as Element).getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const time_ms = canvasXToTime(cssX);
        const td = tagDragRef.current;
        if (td.mode === 'create') {
          setState(s => ({
            ...s,
            pendingTag: {
              label: 'tag',
              start_ms: Math.min(td.startTime_ms, time_ms),
              end_ms: Math.max(td.startTime_ms, time_ms),
            }
          }));
        } else {
          const dur = td.tag.end_ms - td.tag.start_ms;
          const newStart = time_ms - td.grabOffset_ms;
          dispatch({
            t: 'moveTag', index: td.index,
            tag: { ...td.tag, start_ms: newStart, end_ms: newStart + dur },
          });
        }
        return;
      }
      if (dragRef.current === null) return;
      const deltaX = e.clientX - dragRef.current.startX;
      if (deltaX !== 0) {
        dragRef.current.didDrag = true;
        dispatch({ t: 'seek', delta_ms: -deltaX * msPerPixel });
        dragRef.current.startX = e.clientX;
      }
    },
    onPointerUp: (e: PointerEvent) => {
      if (tagDragRef.current !== null) {
        const td = tagDragRef.current;
        if (td.mode === 'create') {
          const rect = (e.target as Element).getBoundingClientRect();
          const cssX = e.clientX - rect.left;
          const endTime_ms = canvasXToTime(cssX);
          if (Math.abs(endTime_ms - td.startTime_ms) > 100) {
            dispatch({
              t: 'addTag',
              tag: {
                label: 'tag',
                start_ms: Math.min(td.startTime_ms, endTime_ms),
                end_ms: Math.max(td.startTime_ms, endTime_ms),
              }
            });
          }
          setState(s => ({ ...s, pendingTag: undefined }));
        }
        // move mode: final position already applied via moveTag dispatches
        tagDragRef.current = null;
      } else {
        if (dragRef.current !== null && !dragRef.current.didDrag && state.playback !== undefined) {
          const isPaused = state.playback.pausedAt_ms !== undefined;
          dispatch({ t: isPaused ? 'resume' : 'pause' });
        }
        dragRef.current = null;
      }
    },
    onWheel: (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.pow(1.001, -e.deltaY);
      setState(s => ({
        ...s,
        pixelPerMs: Math.min(1, Math.max(1 / 200, s.pixelPerMs * factor)),
      }));
    }
  };

  return (
    <div className="app-container">
      <div className="navbar">
        <span>midi notebook</span>
        {state.songIx && (state.songIx.file.replace(/\.json$/, '') + '/' + state.songIx.ix)}
        <div className="transport">
          {state.playback && state.song && (
            formatDuration(state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms)
            + '/' +
            formatDuration(state.song.events[state.song.events.length - 1].time_ms)
          )}
          <button className="transport-btn" onClick={() => dispatch({ t: 'seekToStart' })} disabled={!state.playback}>
            <img src="/icons/skip-back.svg" width={18} height={18} />
          </button>
          <button className="transport-btn" onClick={() => {
            if (!state.playback) return;
            dispatch({ t: state.playback.pausedAt_ms !== undefined ? 'resume' : 'pause' });
          }} disabled={!state.playback}>
            <img src={state.playback?.pausedAt_ms !== undefined ? '/icons/play.svg' : '/icons/pause.svg'} width={18} height={18} />
          </button>
          <button className="transport-btn" onClick={() => dispatch({ t: 'seekToEnd' })} disabled={!state.playback}>
            <img src="/icons/skip-forward.svg" width={18} height={18} />
          </button>
        </div>
      </div>

      <div className="main-content">
        <canvas
          ref={cref}
          className="piano-roll-canvas"
          onPointerDown={canvasHandlers.onPointerDown}
          onPointerMove={canvasHandlers.onPointerMove}
          onPointerUp={canvasHandlers.onPointerUp}
          onPointerLeave={canvasHandlers.onPointerUp}
          onWheel={canvasHandlers.onWheel}
        />

        <div className="sidebar-overlay">
          <div className="sidebar-icons">
            <SidebarButton
              icon={<Icon src="/icons/folder.svg" active={activePanel === 'files'} />}
              active={activePanel === 'files'}
              onClick={() => togglePanel('files')}
            />
            <SidebarButton
              icon={<Icon src="/icons/record.svg" active={activePanel === 'recording'} />}
              active={activePanel === 'recording'}
              onClick={() => togglePanel('recording')}
            />
            <SidebarButton
              icon={<Icon src="/icons/piano.svg" active={activePanel === 'settings'} />}
              active={activePanel === 'settings'}
              onClick={() => togglePanel('settings')}
            />
          </div>

          {activePanel !== null && (
            <div className="sidebar-panel">
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
          )}
        </div>
      </div>
    </div>
  );
}
