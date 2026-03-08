import { init } from './app';
import { createAudioOutput } from './audio-output';
import { Index, SongEntry, SongEvent, indexToSongEntries } from './song';
import { MidiInputStatus } from './types';
import { getText } from './util';


function getInput(midi: WebMidi.MIDIAccess): WebMidi.MIDIInput | null {
  for (const [, input] of midi.inputs) {
    if (input.state === 'connected' && input.name?.match(/Turtle Beach/)) {
      return input;
    }
  }
  return null;
}

function logMidiPorts(midi: WebMidi.MIDIAccess) {
  console.log('MIDI inputs:');
  for (const [id, input] of midi.inputs) {
    console.log(`  ${id}: "${input.name}" state=${input.state} connection=${input.connection}`);
  }
  console.log('MIDI outputs:');
  for (const [id, output] of midi.outputs) {
    console.log(`  ${id}: "${output.name}" state=${output.state} connection=${output.connection}`);
  }
}

function getOutput(midi: WebMidi.MIDIAccess): WebMidi.MIDIOutput | null {
  for (const output of midi.outputs.entries()) {
    const name = output[1].name;
    if (name !== undefined && name.match(/Turtle Beach/)) {
      return output[1];
    }
  }
  return null;
}

// Timing state for computing deltas
const timing = {
  midiLastTime_us: 0,
  wallLastTime_ms: 0,
  isFirstEvent: true,
};

async function go() {
  try {
    let midiOutput: WebMidi.MIDIOutput | null = null;
    let midi: WebMidi.MIDIAccess | null = null;
    let currentInput: WebMidi.MIDIInput | null = null;
    let midiInputStatus: MidiInputStatus = 'unavailable';

    if (!READONLY) {
      try {
        midi = await navigator.requestMIDIAccess({ sysex: true });
        logMidiPorts(midi);
        currentInput = getInput(midi);
        midiOutput = getOutput(midi);
        midiInputStatus = currentInput ? 'connected' : 'disconnected';
        console.log(`midi input: ${currentInput ? `found (${currentInput.name})` : 'not found'}, output: ${midiOutput ? `found (${midiOutput.name})` : 'not found'}`);
      } catch (e) {
        console.log('MIDI access denied or unavailable:', e);
        midiInputStatus = 'unavailable';
      }
    }

    const progressFill = document.querySelector('.loading-progress-fill') as HTMLElement | null;
    const progressText = document.querySelector('.loading-text') as HTMLElement | null;

    async function fetchSoundfont(): Promise<ArrayBuffer> {
      const response = await fetch('soundfont/gm-good.sf3');
      const contentLength = Number(response.headers.get('Content-Length'));
      if (!contentLength || !response.body) {
        return response.arrayBuffer();
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const pct = Math.min(100, Math.round(100 * received / contentLength));
        if (progressFill) progressFill.style.width = pct + '%';
        if (progressText) progressText.textContent = `loading soundfont... ${pct}%`;
      }
      const result = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result.buffer;
    }

    const [soundfontData, indexText] = await Promise.all([
      fetchSoundfont(),
      getText('logIndex.json'),
    ]);
    const output = createAudioOutput(midiOutput, 'soundfont/gm-good.sf3', soundfontData);
    const index: Index = JSON.parse(indexText);
    const songs = indexToSongEntries(index);

    const onSave = () => { timing.isFirstEvent = true; };

    function midiMessageHandler(e: WebMidi.MIDIMessageEvent) {
      console.log(e.data);
      let event: SongEvent;
      if (timing.isFirstEvent) {
        event = {
          message: Array.from(e.data),
          delta: { midi_us: 0, wall_ms: 0 }
        };
        timing.isFirstEvent = false;
      } else {
        event = {
          message: Array.from(e.data),
          delta: {
            midi_us: Math.round(1000 * e.timeStamp - timing.midiLastTime_us),
            wall_ms: Math.round(Date.now() - timing.wallLastTime_ms),
          }
        };
      }
      timing.midiLastTime_us = 1000 * e.timeStamp;
      timing.wallLastTime_ms = Date.now();
      app.dispatch({ t: 'addPendingEvent', event });
    }

    async function refreshMidi() {
      console.log('Refreshing MIDI ports...');
      try {
        // Re-request to get a fresh MIDIAccess with updated port map
        midi = await navigator.requestMIDIAccess({ sysex: true });
      } catch (e) {
        console.log('MIDI re-request failed:', e);
        return;
      }
      logMidiPorts(midi);

      const newInput = getInput(midi);
      if (newInput && !currentInput) {
        currentInput = newInput;
        timing.isFirstEvent = true;
        currentInput.addEventListener('midimessage', midiMessageHandler);
        app.dispatch({ t: 'setMidiInputStatus', status: 'connected', name: currentInput.name ?? undefined });
        console.log(`MIDI input connected: ${currentInput.name}`);
      } else if (!newInput && currentInput) {
        const oldName = currentInput.name;
        currentInput = null;
        app.dispatch({ t: 'setMidiInputStatus', status: 'disconnected' });
        console.log(`MIDI input disconnected: ${oldName}`);
      } else if (newInput) {
        console.log(`MIDI input unchanged: ${newInput.name}`);
      } else {
        console.log('No matching MIDI input found');
      }
    }

    const midiInputName = currentInput?.name ?? undefined;
    const onRefreshMidi = midi ? refreshMidi : undefined;
    const app = init({ songs, output, onSave, midiInputStatus, midiInputName, onRefreshMidi });

    if (!READONLY && midi) {
      if (currentInput) {
        currentInput.addEventListener('midimessage', midiMessageHandler);
      }

      midi.addEventListener('statechange', (e) => {
        const port = (e as any).port;
        console.log(`MIDI statechange: ${port?.type} "${port?.name}" state=${port?.state} connection=${port?.connection}`);
        refreshMidi();
      });
    }
  }
  catch (e) {
    console.log(e);
    console.log(`error: ${e}`);
  }
}

// Gets called by <script> tag after <body> after document fully loaded
(window as any)['go'] = go;
