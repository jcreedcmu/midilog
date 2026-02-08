import { init } from './app';
import { createAudioOutput } from './audio-output';
import { SongLibrary, Song, SongEvent, chunkDuration_ms } from './song';
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
    const songsJson = await getText('/api/songs');
    const rawSongs: { file: string, ix: number, song: Song }[] = JSON.parse(songsJson);
    const library: SongLibrary = rawSongs.map(entry => ({
      ...entry,
      duration_ms: chunkDuration_ms(entry.song.events),
    }));

    const onSave = async (events: SongEvent[]) => {
      const payload: Song = {
        uuid: crypto.randomUUID(),
        start: new Date().toJSON(),
        events
      };
      const req = new Request('/api/save', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await (await fetch(req)).json();
      console.log(res);
      timing.isFirstEvent = true;
    };

    const app = init({ library, output, onSave });

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
