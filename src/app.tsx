import { createRoot } from 'react-dom/client';
import { useRef, useState, useEffect } from 'react';
import { Song, SongEntry, noteSong, timedSong, SongEvent, Tag } from './song';
import { useCanvas } from './use-canvas';
import { getText, unreachable } from './util';
import { AudioOutput, OutputMode, send, allNotesOff, setMode } from './audio-output';
import { renderMainCanvas, TAG_LANE_TOP, TAG_LANE_H, TAG_LANE_BOTTOM } from './render-canvas';
import {
  AppState, AppProps, AppHandle, InitProps, Action, Dispatch, SongIx,
  SidebarPanel, Playhead, Playback, CanvasHandlers, EditingTag,
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
function FilesPanel({ songs, dispatch, currentSong }: { songs: SongEntry[], dispatch: Dispatch, currentSong: SongIx | undefined }) {
  return (
    <div className="files-panel">
      <h3 className="panel-header">Entries</h3>
      <div className="files-scroll">
        <table className="files-table">
          <thead>
            <tr><th>date</th><th>#</th><th>dur</th></tr>
          </thead>
          <tbody>
            {songs.map(({ file, ix, duration_ms, dirty }) => {
              const isActive = currentSong && currentSong.file === file && currentSong.ix === ix;
              return (
                <tr
                  key={`${file}-${ix}`}
                  className={cx('files-row', isActive && 'active')}
                  onClick={() => dispatch({ t: 'playFile', file, ix })}
                >
                  <td>{file.replace(/\.json$/, '')}{dirty ? ' *' : ''}</td>
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

// Tags panel
function TagsPanel({ tags, dispatch }: { tags: Tag[] | undefined, dispatch: Dispatch }) {
  if (!tags || tags.length === 0) {
    return (
      <div className="panel-content">
        <h3 className="panel-header">Tags</h3>
        <div className="tag-hint">No tags on this song</div>
      </div>
    );
  }
  return (
    <div className="panel-content">
      <h3 className="panel-header">Tags</h3>
      <ul className="tag-list">
        {tags.map((tag, i) => (
          <li key={i} className="tag-item">
            <span className="tag-label tag-clickable" onClick={() => dispatch({ t: 'seekToTime', time_ms: tag.start_ms })}>{tag.label}</span>
            <span className="tag-range">{formatDuration(tag.start_ms)}&ndash;{formatDuration(tag.end_ms)}</span>
            {!READONLY && <button className="tag-remove" onClick={() => dispatch({ t: 'removeTag', index: i })}>&#215;</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function App(props: AppProps): JSX.Element {
  const { songs: initialSongs, output, onSave, dispatchRef } = props;
  const [state, setState] = useState<AppState>({
    songs: initialSongs,
    playback: undefined,
    rawSong: undefined,
    song: undefined,
    nSong: undefined,
    songIx: undefined,
    pendingEvents: [],
    pendingTag: undefined,
    pixelPerMs: 1 / 10,
    speed: 1,
  });
  const [activePanel, setActivePanel] = useState<SidebarPanel | null>('files');
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const togglePanel = (panel: SidebarPanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };
  const [cref, mc] = useCanvas(
    state, renderMainCanvas,
    [state.playback?.playhead.fastNowTime_ms, state.playback, state.song, state.song?.tags, state.pendingTag, state.pixelPerMs, state.speed],
    () => { }
  );

  // Pre-fetch parsed song arrays; cache check happens inside setState
  const fetchedSongsRef = useRef<Map<string, Song[]>>(new Map());

  const playCallback = async (file: string, ix: number) => {
    // Silence any currently playing notes before loading new song
    allNotesOff(output);

    // Always fetch the file so it's available (may already be cached in entry.song)
    if (!fetchedSongsRef.current.has(file)) {
      fetchedSongsRef.current.set(file, JSON.parse(await getText(`log/${file}`)));
    }
    const fileSongs = fetchedSongsRef.current.get(file)!;

    setState(s => {
      const entry = s.songs.find(e => e.file === file && e.ix === ix);
      let raw: Song;
      let newSongs = s.songs;
      if (entry?.song) {
        raw = entry.song;
      } else {
        raw = fileSongs[ix];
        // Cache it (not dirty — just caching server data)
        newSongs = s.songs.map(e => e.file === file && e.ix === ix ? { ...e, song: raw } : e);
      }

      const song = timedSong(raw);
      const nSong = noteSong(song);
      const startTime_ms = window.performance.now();
      const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime_ms, fastNowTime_ms: startTime_ms };

      return {
        ...s,
        songs: newSongs,
        rawSong: raw,
        song,
        nSong,
        songIx: { file, ix },
        playback: { timeoutId: 0, playhead, startTime_ms, pausedAt_ms: startTime_ms },
      };
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
          send(output, action.message, s.playback.startTime_ms + action.atTime_ms / s.speed);
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
          const currentPosition = (playback.playhead.fastNowTime_ms - playback.startTime_ms) * s.speed;
          const songDuration = song.events[song.events.length - 1].time_ms;
          const newPosition = Math.max(0, Math.min(songDuration, currentPosition + action.delta_ms));
          const actualDelta = newPosition - currentPosition;
          const newEventIndex = findEventIndexAtTime(song, newPosition);
          return {
            ...s,
            playback: {
              ...playback,
              startTime_ms: playback.startTime_ms - actualDelta / s.speed,
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
              startTime_ms: now - songDuration / s.speed,
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
          if (!s.song || !s.rawSong || !s.songIx) return s;
          const tags = [...(s.song.tags || []), action.tag];
          const rawSong = { ...s.rawSong, tags };
          const { file, ix } = s.songIx;
          return {
            ...s,
            song: { ...s.song, tags },
            rawSong,
            songs: s.songs.map(e => e.file === file && e.ix === ix ? { ...e, song: rawSong, dirty: true } : e),
          };
        });
        break;
      case 'moveTag':
        setState(s => {
          if (!s.song?.tags || !s.rawSong || !s.songIx) return s;
          const tags = s.song.tags.map((t, i) => i === action.index ? action.tag : t);
          const rawSong = { ...s.rawSong, tags };
          const { file, ix } = s.songIx;
          return {
            ...s,
            song: { ...s.song, tags },
            rawSong,
            songs: s.songs.map(e => e.file === file && e.ix === ix ? { ...e, song: rawSong, dirty: true } : e),
          };
        });
        break;
      case 'renameTag':
        setState(s => {
          if (!s.song?.tags || !s.rawSong || !s.songIx) return s;
          const tags = s.song.tags.map((t, i) => i === action.index ? { ...t, label: action.label } : t);
          const rawSong = { ...s.rawSong, tags };
          const { file, ix } = s.songIx;
          return {
            ...s,
            song: { ...s.song, tags },
            rawSong,
            songs: s.songs.map(e => e.file === file && e.ix === ix ? { ...e, song: rawSong, dirty: true } : e),
          };
        });
        break;
      case 'removeTag':
        setState(s => {
          if (!s.song?.tags || !s.rawSong || !s.songIx) return s;
          const tags = s.song.tags.filter((_, i) => i !== action.index);
          const rawSong = { ...s.rawSong, tags };
          const { file, ix } = s.songIx;
          return {
            ...s,
            song: { ...s.song, tags },
            rawSong,
            songs: s.songs.map(e => e.file === file && e.ix === ix ? { ...e, song: rawSong, dirty: true } : e),
          };
        });
        break;
      case 'seekToTime':
        setState(s => {
          if (s.playback === undefined || s.song === undefined)
            return s;
          allNotesOff(output);
          const now = window.performance.now();
          const eventIndex = findEventIndexAtTime(s.song, action.time_ms);
          return {
            ...s,
            playback: {
              ...s.playback,
              startTime_ms: now - action.time_ms / s.speed,
              pausedAt_ms: now,
              playhead: { eventIndex, nowTime_ms: now, fastNowTime_ms: now }
            }
          };
        });
        break;
      default:
        unreachable(action);
    }
  };

  // Expose dispatch to parent
  dispatchRef.current = dispatch;

  const handleSave = () => {
    const events = state.pendingEvents;
    if (events.length === 0) return;
    const song: Song = {
      uuid: crypto.randomUUID(),
      start: new Date().toJSON(),
      events,
    };
    // Compute duration from events
    let total_us = 0;
    for (const ev of events) {
      const midi_us = ev.delta.midi_us > 0x100000000 ? 0 : ev.delta.midi_us;
      total_us += midi_us;
    }
    const duration_ms = total_us / 1000;
    const file = new Date().toJSON().replace(/T.*/, '') + '.json';
    setState(s => {
      const ix = s.songs.filter(e => e.file === file).length;
      const entry: SongEntry = { file, ix, duration_ms, song, dirty: true };
      return { ...s, songs: [...s.songs, entry], pendingEvents: [] };
    });
    onSave(); // just resets timing
  };

  const handleDiscard = () => {
    dispatch({ t: 'clearPendingEvents' });
  };

  const dragRef = useRef<{ startX: number, didDrag: boolean } | null>(null);
  type TagDrag =
    | { mode: 'create', startTime_ms: number }
    | { mode: 'move', index: number, grabOffset_ms: number, tag: Tag }
    | { mode: 'resize', index: number, tag: Tag };
  const tagDragRef = useRef<TagDrag | null>(null);
  const msPerPixel = 1 / state.pixelPerMs;

  function canvasXToTime(cssX: number): number {
    if (!state.playback || !mc.current) return 0;
    const cw = mc.current.size.x;
    const playHeadPosition_px = (state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms) * state.speed * state.pixelPerMs;
    const xshift = cw / 2 - playHeadPosition_px;
    return (cssX - xshift) * msPerPixel;
  }

  function timeToCanvasX(time_ms: number): number {
    if (!state.playback || !mc.current) return 0;
    const cw = mc.current.size.x;
    const playHeadPosition_px = (state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms) * state.speed * state.pixelPerMs;
    const xshift = cw / 2 - playHeadPosition_px;
    return xshift + time_ms * state.pixelPerMs;
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

      if (!READONLY && cssY >= TAG_LANE_TOP && cssY < TAG_LANE_BOTTOM && state.playback) {
        const time_ms = canvasXToTime(cssX);
        const hitIndex = findTagAtTime(time_ms);
        if (hitIndex >= 0) {
          const tag = state.song!.tags![hitIndex];
          const tagRightCssX = timeToCanvasX(tag.end_ms);
          if (tagRightCssX - cssX < 20) {
            tagDragRef.current = { mode: 'resize', index: hitIndex, tag };
          } else {
            tagDragRef.current = { mode: 'move', index: hitIndex, grabOffset_ms: time_ms - tag.start_ms, tag };
          }
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
        const songEnd = state.song ? state.song.events[state.song.events.length - 1].time_ms : Infinity;
        if (td.mode === 'create') {
          setState(s => ({
            ...s,
            pendingTag: {
              label: 'tag',
              start_ms: Math.max(0, Math.min(songEnd, Math.min(td.startTime_ms, time_ms))),
              end_ms: Math.max(0, Math.min(songEnd, Math.max(td.startTime_ms, time_ms))),
            }
          }));
        } else if (td.mode === 'move') {
          const dur = td.tag.end_ms - td.tag.start_ms;
          const clampedStart = Math.max(0, Math.min(songEnd - dur, time_ms - td.grabOffset_ms));
          dispatch({
            t: 'moveTag', index: td.index,
            tag: { ...td.tag, start_ms: clampedStart, end_ms: clampedStart + dur },
          });
        } else if (td.mode === 'resize') {
          const newEnd = Math.max(td.tag.start_ms + 100, Math.min(songEnd, time_ms));
          dispatch({
            t: 'moveTag', index: td.index,
            tag: { ...td.tag, end_ms: newEnd },
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
    },
    onDoubleClick: (e: MouseEvent) => {
      if (READONLY) return;
      const rect = (e.target as Element).getBoundingClientRect();
      const cssY = e.clientY - rect.top;
      const cssX = e.clientX - rect.left;
      if (cssY >= TAG_LANE_TOP && cssY < TAG_LANE_BOTTOM) {
        const time_ms = canvasXToTime(cssX);
        const hitIndex = findTagAtTime(time_ms);
        if (hitIndex >= 0) {
          const tag = state.song!.tags![hitIndex];
          const tagCssX = timeToCanvasX(tag.start_ms);
          const tagCssW = (tag.end_ms - tag.start_ms) * state.pixelPerMs;
          setEditingTag({ index: hitIndex, cssX: tagCssX, cssW: tagCssW });
          dispatch({ t: 'pause' });
        }
      }
    }
  };

  useEffect(() => {
    if (editingTag && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTag]);

  function commitTagEdit(value: string) {
    if (editingTag === null) return;
    if (value.length > 0) {
      dispatch({ t: 'renameTag', index: editingTag.index, label: value });
    }
    setEditingTag(null);
  }

  const isDirty = state.songs.some(e => e.dirty);

  const handleGlobalSave = async () => {
    const dirtyEntries = state.songs.filter(e => e.dirty && e.song);
    for (const entry of dirtyEntries) {
      await fetch(new Request('/api/save', {
        method: 'POST',
        body: JSON.stringify({ song: entry.song, file: entry.file, ix: entry.ix }),
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    setState(s => ({
      ...s,
      songs: s.songs.map(e => e.dirty ? { ...e, dirty: false } : e),
    }));
  };

  return (
    <div className="app-container">
      <div className="navbar">
        <span>midi notebook</span>
        {state.songIx && (state.songIx.file.replace(/\.json$/, '') + '/' + state.songIx.ix)}
        <div className="transport">
          {!READONLY && <button className="transport-btn" onClick={handleGlobalSave} disabled={!isDirty}>
            <img src="icons/save.svg" width={18} height={18} />
          </button>}
          <button className={cx('transport-btn', state.speed !== 1 && 'speed-active')} onClick={() => {
            setState(s => {
              const newSpeed = s.speed === 1 ? 2 : 1;
              if (s.playback) {
                const now = window.performance.now();
                const songPos = (now - s.playback.startTime_ms) * s.speed;
                return { ...s, speed: newSpeed, playback: { ...s.playback, startTime_ms: now - songPos / newSpeed } };
              }
              return { ...s, speed: newSpeed };
            });
          }}>
            {state.speed === 1 ? '2x' : '1x'}
          </button>
          {state.playback && state.song && (
            formatDuration((state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms) * state.speed)
            + '/' +
            formatDuration(state.song.events[state.song.events.length - 1].time_ms)
          )}
          <button className="transport-btn" onClick={() => dispatch({ t: 'seekToStart' })} disabled={!state.playback}>
            <img src="icons/skip-back.svg" width={18} height={18} />
          </button>
          <button className="transport-btn" onClick={() => {
            if (!state.playback) return;
            dispatch({ t: state.playback.pausedAt_ms !== undefined ? 'resume' : 'pause' });
          }} disabled={!state.playback}>
            <img src={state.playback?.pausedAt_ms !== undefined ? 'icons/play.svg' : 'icons/pause.svg'} width={18} height={18} />
          </button>
          <button className="transport-btn" onClick={() => dispatch({ t: 'seekToEnd' })} disabled={!state.playback}>
            <img src="icons/skip-forward.svg" width={18} height={18} />
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
          onDoubleClick={canvasHandlers.onDoubleClick}
        />

        {editingTag && state.song?.tags?.[editingTag.index] && (
          <input
            ref={editInputRef}
            className="tag-edit-input"
            style={{
              position: 'absolute',
              left: editingTag.cssX,
              top: TAG_LANE_TOP,
              width: Math.max(60, editingTag.cssW),
              height: TAG_LANE_H,
            }}
            defaultValue={state.song.tags[editingTag.index].label}
            onBlur={e => commitTagEdit(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTagEdit(e.currentTarget.value);
              if (e.key === 'Escape') setEditingTag(null);
            }}
          />
        )}

        <div className="sidebar-overlay">
          <div className="sidebar-icons">
            <SidebarButton
              icon={<Icon src="icons/folder.svg" active={activePanel === 'files'} />}
              active={activePanel === 'files'}
              onClick={() => togglePanel('files')}
            />
            {!READONLY && <SidebarButton
              icon={<Icon src="icons/record.svg" active={activePanel === 'recording'} />}
              active={activePanel === 'recording'}
              onClick={() => togglePanel('recording')}
            />}
            <SidebarButton
              icon={<Icon src="icons/piano.svg" active={activePanel === 'settings'} />}
              active={activePanel === 'settings'}
              onClick={() => togglePanel('settings')}
            />
            <SidebarButton
              icon={<Icon src="icons/tag.svg" active={activePanel === 'tags'} />}
              active={activePanel === 'tags'}
              onClick={() => togglePanel('tags')}
            />
          </div>

          {activePanel !== null && (
            <div className="sidebar-panel">
              {activePanel === 'files' && (
                <FilesPanel songs={state.songs} dispatch={dispatch} currentSong={state.songIx} />
              )}
              {activePanel === 'recording' && (
                <RecordingPanel pendingEvents={state.pendingEvents} onSave={handleSave} onDiscard={handleDiscard} />
              )}
              {activePanel === 'settings' && (
                <SettingsPanel outputMode={output.mode} hasMidi={output.midiOutput !== null} dispatch={dispatch} />
              )}
              {activePanel === 'tags' && (
                <TagsPanel tags={state.song?.tags} dispatch={dispatch} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
