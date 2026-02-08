import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { pitchColor, Index, NoteSong, TimedSong, noteSong, timedSong, pitchName, SongEvent, Tag } from './song';
import { CanvasInfo, CanvasRef, useCanvas } from './use-canvas';
import { getText, unreachable } from './util';
import { AudioOutput, OutputMode, send, allNotesOff, setMode } from './audio-output';

// Pre-load pedal mark image for canvas rendering
const pedalMarkImg = new Image();
pedalMarkImg.src = '/icons/pedal-mark.svg';

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
  songUuid: string | undefined,
  song: TimedSong | undefined,
  nSong: NoteSong | undefined,
  playback: Playback | undefined,
  pendingEvents: SongEvent[],
  tags: Tag[],
};

export type SidebarPanel = 'files' | 'recording' | 'settings' | 'tags';

export type Action =
  | { t: 'none' }
  | { t: 'playFile', file: string, ix: number }
  | { t: 'playNote', message: number[], atTime_ms: number, newIx: number | undefined }
  | { t: 'idle' }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'seek', delta_ms: number }
  | { t: 'seekToStart' }
  | { t: 'seekToEnd' }
  | { t: 'addPendingEvent', event: SongEvent }
  | { t: 'clearPendingEvents' }
  | { t: 'setOutputMode', mode: OutputMode }
  | { t: 'addTag', tag: Tag }
  | { t: 'removeTag', index: number }
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

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type CanvasHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

// Sidebar icon button
function SidebarButton({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('sidebar-button', active && 'active')}>
      {icon}
    </button>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
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

// Tags panel
function TagsPanel({ tags, songUuid, tagLabel, setTagLabel, dispatch }: {
  tags: Tag[],
  songUuid: string | undefined,
  tagLabel: string,
  setTagLabel: (v: string) => void,
  dispatch: Dispatch,
}) {
  if (!songUuid) {
    return (
      <div className="panel-content">
        <h3 className="panel-header">Tags</h3>
        <div className="tag-hint">Load a song to add tags</div>
      </div>
    );
  }
  return (
    <div className="panel-content">
      <h3 className="panel-header">Tags</h3>
      <input
        className="tag-input"
        type="text"
        placeholder="Tag label..."
        value={tagLabel}
        onChange={e => setTagLabel((e.target as HTMLInputElement).value)}
      />
      <div className="tag-hint">Drag on piano roll to create a tag</div>
      {tags.length > 0 && (
        <ul className="tag-list">
          {tags.map((tag, i) => (
            <li key={i} className="tag-item">
              <span className="tag-label">{tag.label}</span>
              <span className="tag-range">{formatDuration(tag.start_ms)}&ndash;{formatDuration(tag.end_ms)}</span>
              <button className="tag-remove" onClick={() => dispatch({ t: 'removeTag', index: i })}>&#215;</button>
            </li>
          ))}
        </ul>
      )}
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
  const pixel_of_pitch = 10;
  const vert_offset = 1000;
  const note_pitch_thickness = 1;
  const [cw, ch] = [ci.size.x, ci.size.y];
  const shadowColor = '#577';

  let playHeadPosition_px = 0;
  if (playback !== undefined) {
    playHeadPosition_px = (playback.playhead.fastNowTime_ms - playback.startTime_ms) * pixel_of_ms;
  }

  let xshift = 0;

  // if (playHeadPosition_px > cw / 2) {
  xshift = cw / 2 - playHeadPosition_px;
  //}
  d.fillStyle = "#f0f0f7";
  d.fillRect(0, 0, cw, ch);
  const fontHeight = 12;

  d.font = `bold ${fontHeight}px 'Roboto Condensed', sans-serif`;
  d.textBaseline = 'middle';
  d.textAlign = 'right';
  const currentTime_ms = playback ? playback.playhead.fastNowTime_ms - playback.startTime_ms : 0;

  // draw octave lines
  for (let i = 0; i < 8; i++) {
    d.save();
    d.fillStyle = '#bbc';
    d.fillRect(0, vert_offset - pixel_of_pitch * (11 + i * 12), cw, 1);
    d.fillStyle = '#dde';
    d.fillRect(0, vert_offset - pixel_of_pitch * (18 + i * 12), cw, 1);
  }

  if (state.nSong !== undefined) {
    // Draw shadows for active notes first (behind everything)
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        const isActive = currentTime_ms >= event.time_ms && currentTime_ms <= event.time_ms + event.dur_ms;
        if (isActive) {
          d.save();
          d.shadowColor = shadowColor;
          d.shadowBlur = 10;
          d.fillStyle = pitchColor[event.pitch % 12];
          d.fillRect(
            xshift + event.time_ms * pixel_of_ms,
            vert_offset - pixel_of_pitch * event.pitch,
            event.dur_ms * pixel_of_ms,
            pixel_of_pitch * note_pitch_thickness);
          d.restore();
        }
      }
    });
    // Draw all note rectangles
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        const x = xshift + event.time_ms * pixel_of_ms;
        const y = vert_offset - pixel_of_pitch * event.pitch;
        const w = event.dur_ms * pixel_of_ms;
        const h = pixel_of_pitch * note_pitch_thickness;
        d.fillStyle = pitchColor[event.pitch % 12];
        d.fillRect(x, y, w, h);
        const grad = d.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, 'rgba(255,255,255,0.5)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0)');
        grad.addColorStop(0.75, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.3)');
        d.fillStyle = grad;
        d.fillRect(x, y, w, h);
      }
    });
    // Draw note labels
    const textXshift = -1;
    state.nSong.events.forEach(event => {
      if (event.t == 'note') {
        d.fillStyle = shadowColor;
        d.fillText(pitchName[event.pitch % 12],
          textXshift + xshift + event.time_ms * pixel_of_ms,
          1 + vert_offset - pixel_of_pitch * event.pitch + pixel_of_pitch * note_pitch_thickness / 2);

        d.fillStyle = pitchColor[event.pitch % 12];
        d.fillText(pitchName[event.pitch % 12],
          textXshift + -1 + xshift + event.time_ms * pixel_of_ms,
          vert_offset - pixel_of_pitch * event.pitch + pixel_of_pitch * note_pitch_thickness / 2);
      }
    });

    // Draw pedal markings
    const pedalY = 100;
    const pedalMarkH = 16;
    state.nSong.events.forEach(event => {
      if (event.t == 'pedal') {
        const x = xshift + event.time_ms * pixel_of_ms;
        const w = event.dur_ms * pixel_of_ms;

        // Ped marking
        if (pedalMarkImg.complete) {
          const scale = pedalMarkH / pedalMarkImg.naturalHeight;
          const pedalMarkW = pedalMarkImg.naturalWidth * scale;
          d.drawImage(pedalMarkImg, x, pedalY - pedalMarkH - 4, pedalMarkW, pedalMarkH);
        }

        // Dotted line for duration
        d.save();
        d.strokeStyle = '#668';
        d.lineWidth = 1;
        d.setLineDash([3, 3]);
        d.beginPath();
        d.moveTo(x, pedalY);
        d.lineTo(x + w, pedalY);
        d.stroke();
        d.restore();
      }
    });
  }

  // Draw tags
  if (state.tags && state.tags.length > 0) {
    const tagY = 20;
    const tagH = 24;
    const tagRadius = 4;
    state.tags.forEach(tag => {
      const x1 = xshift + tag.start_ms * pixel_of_ms;
      const x2 = xshift + tag.end_ms * pixel_of_ms;
      const w = x2 - x1;

      // Round-rect background
      d.save();
      d.globalAlpha = 0.25;
      d.fillStyle = '#4a9eff';
      d.beginPath();
      d.roundRect(x1, tagY, w, tagH, tagRadius);
      d.fill();
      d.restore();

      // Border
      d.save();
      d.strokeStyle = '#4a9eff';
      d.lineWidth = 1.5;
      d.beginPath();
      d.roundRect(x1, tagY, w, tagH, tagRadius);
      d.stroke();
      d.restore();

      // Label text
      d.save();
      d.fillStyle = '#224';
      d.font = `bold 11px 'Roboto Condensed', sans-serif`;
      d.textBaseline = 'middle';
      d.textAlign = 'left';
      const textX = x1 + 4;
      d.fillText(tag.label, textX, tagY + tagH / 2);
      d.restore();
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
    songUuid: undefined,
    pendingEvents: [],
    tags: [],
  });
  const [activePanel, setActivePanel] = useState<SidebarPanel | null>('files');
  const [tagLabel, setTagLabel] = useState('');
  const togglePanel = (panel: SidebarPanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };
  const [cref, mc] = useCanvas(
    state, _renderMainCanvas,
    [state.playback?.playhead.fastNowTime_ms, state.playback, state.song, state.tags],
    () => { }
  );

  const playCallback: PlayCallback = async (file, ix) => {
    // Silence any currently playing notes before loading new song
    allNotesOff(output);

    const lines = (await getText(`/log/${file}`)).split('\n');
    const raw = JSON.parse(lines[ix]);
    const uuid: string | undefined = raw.uuid;
    const song = timedSong(raw);
    const nSong = noteSong(song);

    const startTime_ms = window.performance.now();
    const playhead: Playhead = { eventIndex: 0, nowTime_ms: startTime_ms, fastNowTime_ms: startTime_ms };

    // Load in paused state - user must click Play to start
    setState(s => {
      return { ...s, song: song, nSong: nSong, songIx: { file, ix }, songUuid: uuid, tags: [], playback: { timeoutId: 0, playhead, startTime_ms, pausedAt_ms: startTime_ms } };
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
        setState(s => ({ ...s, tags: [...s.tags, action.tag] }));
        break;
      case 'removeTag':
        setState(s => ({ ...s, tags: s.tags.filter((_, i) => i !== action.index) }));
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
  const tagDragRef = useRef<{ startX: number, startTime_ms: number } | null>(null);
  const MS_PER_PIXEL = 10; // inverse of pixel_of_ms = 1/10

  function canvasXToTime(canvasX: number): number {
    if (!state.playback || !mc.current) return 0;
    const cw = mc.current.size.x;
    const playHeadPosition_px = (state.playback.playhead.fastNowTime_ms - state.playback.startTime_ms) / MS_PER_PIXEL;
    const xshift = cw / 2 - playHeadPosition_px;
    return (canvasX - xshift) * MS_PER_PIXEL;
  }

  const canvasHandlers: CanvasHandlers = {
    onPointerDown: (e: PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      if (activePanel === 'tags' && state.playback) {
        const rect = (e.target as Element).getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const time_ms = canvasXToTime(canvasX);
        tagDragRef.current = { startX: e.clientX, startTime_ms: time_ms };
      } else {
        dragRef.current = { startX: e.clientX, didDrag: false };
      }
    },
    onPointerMove: (e: PointerEvent) => {
      if (activePanel === 'tags') return; // no-op during tag drag
      if (dragRef.current === null) return;
      const deltaX = e.clientX - dragRef.current.startX;
      if (deltaX !== 0) {
        dragRef.current.didDrag = true;
        dispatch({ t: 'seek', delta_ms: -deltaX * MS_PER_PIXEL });
        dragRef.current.startX = e.clientX;
      }
    },
    onPointerUp: (e: PointerEvent) => {
      if (activePanel === 'tags' && tagDragRef.current !== null && state.playback) {
        const rect = (e.target as Element).getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const endTime_ms = canvasXToTime(canvasX);
        const startTime_ms = tagDragRef.current.startTime_ms;
        const label = tagLabel || 'tag';
        if (Math.abs(endTime_ms - startTime_ms) > 100) { // minimum 100ms drag
          dispatch({
            t: 'addTag',
            tag: {
              label,
              start_ms: Math.min(startTime_ms, endTime_ms),
              end_ms: Math.max(startTime_ms, endTime_ms),
            }
          });
        }
        tagDragRef.current = null;
      } else {
        if (dragRef.current !== null && !dragRef.current.didDrag && state.playback !== undefined) {
          const isPaused = state.playback.pausedAt_ms !== undefined;
          dispatch({ t: isPaused ? 'resume' : 'pause' });
        }
        dragRef.current = null;
      }
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
            <SidebarButton
              icon={<Icon src="/icons/tag.svg" active={activePanel === 'tags'} />}
              active={activePanel === 'tags'}
              onClick={() => togglePanel('tags')}
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
              {activePanel === 'tags' && (
                <TagsPanel tags={state.tags} songUuid={state.songUuid} tagLabel={tagLabel} setTagLabel={setTagLabel} dispatch={dispatch} />
              )}
            </div>
          )}
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
