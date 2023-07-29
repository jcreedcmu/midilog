import { PlayCallback, init } from './app';
import { Index, Song, SongEvent } from './types';
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

function delay(ms: number): Promise<void> {
  return new Promise((res, rej) => {
    setTimeout(() => { res(); }, ms);
  });
}

function getOutput(midi: WebMidi.MIDIAccess): WebMidi.MIDIOutput {
  for (const output of midi.outputs.entries()) {
    const name = output[1].name;
    if (name !== undefined && name.match(/Turtle Beach/)) {
      return output[1];
    }
  }
  throw 'output not found';
}

// Global state
const state: {
  events: SongEvent[],
  midiLastTime_us: number,
  wallLastTime_ms: number,
  songStart: string
} = {
  events: [],
  midiLastTime_us: 0,
  wallLastTime_ms: 0,
  songStart: '',
}


async function saveCallback() {
  const payload: Song = { start: state.songStart, events: state.events };
  const req = new Request('/api/save', {
    method: 'POST', body: JSON.stringify(payload), headers: {
      'Content-Type': 'application/json'
    }
  });
  const res = await (await fetch(req)).json();
  console.log(res);
  state.events = [];
}


async function go() {
  try {

    const midi = await navigator.requestMIDIAccess({ sysex: true });
    const input = getInput(midi);
    const output = getOutput(midi);

    console.log(`success`);
    const ijson = await getText('/logIndex.json');
    const index: Index = JSON.parse(ijson);
    const prefix = '<button id="saveButton">save</button>';
    document.getElementById('index')!.innerHTML = '<div>' + prefix + '</div>';
    document.getElementById('saveButton')!.addEventListener('click', saveCallback);

    init({ index, output });

    input.addEventListener('midimessage', e => {
      console.log(e.data);
      if (state.events.length == 0) {
        state.songStart = new Date().toJSON();
        state.events.push({
          message: Array.from(e.data), delta: {
            midi_us: 0,
            wall_ms: 0,
          }
        });
      }
      else {
        state.events.push({
          message: Array.from(e.data), delta: {
            midi_us: Math.round(1000 * e.timeStamp - state.midiLastTime_us),
            wall_ms: Math.round(Date.now() - state.wallLastTime_ms),
          }
        });
      }
      state.midiLastTime_us = 1000 * e.timeStamp;
      state.wallLastTime_ms = Date.now();
    });
  }
  catch (e) {
    console.log(e);
    console.log(`error: ${e} <br>`);
  }
}

// Gets called by <script> tag after <body> after document fully loaded
(window as any)['go'] = go;
