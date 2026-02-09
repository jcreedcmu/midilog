import { init } from './app';
import { createAudioOutput } from './audio-output';
import { Index, SongEntry, SongEvent } from './song';
import { getText } from './util';


function getInput(midi: WebMidi.MIDIAccess): WebMidi.MIDIInput {
  for (const input of midi.inputs.entries()) {
    const name = input[1].name;
    if (name !== undefined && name.match(/Turtle Beach/)) {
      return input[1];
    }
  }
  throw 'input not found';
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
    const midi = await navigator.requestMIDIAccess({ sysex: true });
    const input = getInput(midi);
    const midiOutput = getOutput(midi);
    const output = createAudioOutput(midiOutput, '/soundfont/gm-good.sf3');

    console.log(`success, midi output: ${midiOutput ? 'found' : 'not found'}`);
    const index: Index = JSON.parse(await getText('/logIndex.json'));
    const songs: SongEntry[] = [];
    for (const row of index) {
      for (let i = 0; i < row.lines; i++) {
        songs.push({ file: row.file, ix: i, duration_ms: row.durations_ms[i], dirty: false });
      }
    }

    const onSave = () => { timing.isFirstEvent = true; };

    const app = init({ songs, output, onSave });

    input.addEventListener('midimessage', e => {
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
    });
  }
  catch (e) {
    console.log(e);
    console.log(`error: ${e} <br>`);
  }
}

// Gets called by <script> tag after <body> after document fully loaded
(window as any)['go'] = go;
