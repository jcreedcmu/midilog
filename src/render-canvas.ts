import { pitchColor, pitchName } from './song';
import { CanvasInfo } from './use-canvas';
import { AppState } from './types';

// Pre-load images for canvas rendering
const pedalMarkImg = new Image();
pedalMarkImg.src = '/icons/pedal-mark.svg';
const tagMarkImg = new Image();
tagMarkImg.src = '/icons/tag.svg';

// Lane layout constants (in CSS pixels)
export const PEDAL_LANE_TOP = 0;
export const PEDAL_LANE_H = 32;
export const TAG_LANE_TOP = PEDAL_LANE_H;
export const TAG_LANE_H = 32;
export const TAG_LANE_BOTTOM = TAG_LANE_TOP + TAG_LANE_H;

export function renderMainCanvas(ci: CanvasInfo, state: AppState) {
  const { d } = ci;
  const { playback } = state;

  const pixel_of_ms = state.pixelPerMs;
  const pixel_of_pitch = 10;
  const vert_offset = 1000;
  const note_pitch_thickness = 1;
  const [cw, ch] = [ci.size.x, ci.size.y];
  const shadowColor = '#577';

  let playHeadPosition_px = 0;
  if (playback !== undefined) {
    playHeadPosition_px = (playback.playhead.fastNowTime_ms - playback.startTime_ms) * state.speed * pixel_of_ms;
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
  const currentTime_ms = playback ? (playback.playhead.fastNowTime_ms - playback.startTime_ms) * state.speed : 0;

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
        if (pixel_of_ms >= 0.05) {
          const grad = d.createLinearGradient(0, y, 0, y + h);
          grad.addColorStop(0, 'rgba(255,255,255,0.5)');
          grad.addColorStop(0.25, 'rgba(255,255,255,0)');
          grad.addColorStop(0.75, 'rgba(255,255,255,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.3)');
          d.fillStyle = grad;
          d.fillRect(x, y, w, h);
        }
      }
    });
    // Draw note labels (only when zoomed in enough)
    if (pixel_of_ms >= 0.05) {
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
    }

    // Draw pedal lane
    d.fillStyle = '#e8e8f0';
    d.fillRect(0, PEDAL_LANE_TOP, cw, PEDAL_LANE_H);

    d.strokeStyle = '#bbc';
    d.lineWidth = 1;
    d.beginPath();
    d.moveTo(0, PEDAL_LANE_TOP + PEDAL_LANE_H - 0.5);
    d.lineTo(cw, PEDAL_LANE_TOP + PEDAL_LANE_H - 0.5);
    d.stroke();

    state.nSong.events.forEach(event => {
      if (event.t == 'pedal') {
        const x = xshift + event.time_ms * pixel_of_ms;
        const w = event.dur_ms * pixel_of_ms;
        d.fillStyle = '#c0c4d0';
        d.fillRect(x, PEDAL_LANE_TOP, w, PEDAL_LANE_H);
      }
    });

    if (pedalMarkImg.complete) {
      const markH = 16;
      const scale = markH / pedalMarkImg.naturalHeight;
      const markW = pedalMarkImg.naturalWidth * scale;
      d.drawImage(pedalMarkImg, cw - markW - 6, PEDAL_LANE_TOP + (PEDAL_LANE_H - markH) / 2, markW, markH);
    }

    // Draw tag lane
    d.fillStyle = '#ebf2fc';
    d.fillRect(0, TAG_LANE_TOP, cw, TAG_LANE_H);

    d.strokeStyle = '#bbc';
    d.lineWidth = 1;
    d.beginPath();
    d.moveTo(0, TAG_LANE_BOTTOM - 0.5);
    d.lineTo(cw, TAG_LANE_BOTTOM - 0.5);
    d.stroke();

    // Draw tag bars (committed + pending)
    const allTags = [...(state.song?.tags || [])];
    if (state.pendingTag) allTags.push(state.pendingTag);
    allTags.forEach(tag => {
      const x = xshift + tag.start_ms * pixel_of_ms;
      const w = (tag.end_ms - tag.start_ms) * pixel_of_ms;
      const margin = 3;
      d.save();
      d.fillStyle = pitchColor[0];
      d.beginPath();
      d.roundRect(x, TAG_LANE_TOP + margin - 0.5, w, TAG_LANE_H - margin * 2, 10);
      d.fill();
      d.clip();
      d.fillStyle = 'white';
      d.textAlign = 'left';
      d.textBaseline = 'middle';
      d.fillText(tag.label, x + 6, TAG_LANE_TOP + TAG_LANE_H / 2);
      d.restore();
    });

    if (tagMarkImg.complete) {
      const markH = 16;
      const scale = markH / tagMarkImg.naturalHeight;
      const markW = tagMarkImg.naturalWidth * scale;
      d.drawImage(tagMarkImg, cw - markW - 6, TAG_LANE_TOP + (TAG_LANE_H - markH) / 2, markW, markH);
    }
  }

  // Song boundary dashed lines
  if (state.song && state.song.events.length > 0) {
    const songEnd_ms = state.song.events[state.song.events.length - 1].time_ms;
    d.save();
    d.setLineDash([6, 4]);
    d.strokeStyle = '#889';
    d.lineWidth = 1;
    for (const t of [0, songEnd_ms]) {
      const x = Math.round(xshift + t * pixel_of_ms) + 0.5;
      d.beginPath();
      d.moveTo(x, 0);
      d.lineTo(x, ch);
      d.stroke();
    }
    d.restore();
  }

  if (playback !== undefined) {
    d.fillStyle = 'black';
    d.fillRect(xshift + playHeadPosition_px, 0, 2, ch);
  }
}
