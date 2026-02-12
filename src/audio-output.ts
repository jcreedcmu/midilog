import { WorkletSynthesizer } from "spessasynth_lib";

export type OutputMode = 'midi' | 'software';

export type AudioOutput = {
  mode: OutputMode;
  midiOutput: WebMidi.MIDIOutput | null;
  synth: WorkletSynthesizer | null;
  context: AudioContext | null;
  soundfontUrl: string | null;
  soundfontData: ArrayBuffer | null;
  initPromise: Promise<void> | null;
};

export function createAudioOutput(
  midiOutput: WebMidi.MIDIOutput | null,
  soundfontUrl?: string,
  soundfontData?: ArrayBuffer,
): AudioOutput {
  return {
    mode: 'software',
    midiOutput,
    synth: null,
    context: null,
    soundfontUrl: soundfontUrl ?? null,
    soundfontData: soundfontData ?? null,
    initPromise: null,
  };
}

async function initSynth(output: AudioOutput): Promise<void> {
  if (output.synth || (!output.soundfontUrl && !output.soundfontData)) return;

  try {
    const context = new AudioContext();
    await context.audioWorklet.addModule('js/spessasynth_processor.min.js');
    const synth = new WorkletSynthesizer(context);
    const sfont = output.soundfontData ?? await (await fetch(output.soundfontUrl!)).arrayBuffer();
    await synth.soundBankManager.addSoundBank(sfont, "main");
    await synth.isReady;

    // Connect processors to destination via gain node
    const gain = context.createGain();
    gain.gain.value = 1.0;
    gain.connect(context.destination);
    synth.connect(gain);
    if (synth.reverbProcessor) {
      synth.reverbProcessor.connect(gain);
    }
    if (synth.chorusProcessor) {
      synth.chorusProcessor.connect(gain);
    }

    output.context = context;
    output.synth = synth;
    console.log('SpessaSynth initialized');
  } catch (e) {
    console.error('Failed to initialize SpessaSynth:', e);
  }
}

function ensureSynthReady(output: AudioOutput): Promise<void> {
  if (output.synth) return Promise.resolve();
  if (!output.initPromise) {
    output.initPromise = initSynth(output);
  }
  return output.initPromise;
}

export function setMode(output: AudioOutput, mode: OutputMode): void {
  allNotesOff(output);
  output.mode = mode;
  // Trigger lazy init when switching to software mode
  if (mode === 'software') {
    ensureSynthReady(output);
  }
}

export async function send(output: AudioOutput, message: number[], timestamp?: number): Promise<void> {
  if (output.mode === 'midi' && output.midiOutput) {
    output.midiOutput.send(message, timestamp);
  } else if (output.mode === 'software') {
    await ensureSynthReady(output);
    if (!output.synth) return;

    const [status, data1, data2] = message;
    const channel = status & 0x0f;
    const messageType = status & 0xf0;

    switch (messageType) {
      case 0x90: // Note On
        if (data2 > 0) {
          output.synth.noteOn(channel, data1, data2);
        } else {
          output.synth.noteOff(channel, data1);
        }
        break;
      case 0x80: // Note Off
        output.synth.noteOff(channel, data1);
        break;
      case 0xB0: // Control Change
        output.synth.controllerChange(channel, data1, data2);
        break;
      case 0xC0: // Program Change
        output.synth.programChange(channel, data1);
        break;
      case 0xE0: // Pitch Bend
        output.synth.pitchWheel(channel, data1, data2);
        break;
    }
  }
}

export function allNotesOff(output: AudioOutput): void {
  if (output.mode === 'midi' && output.midiOutput) {
    // Clear any scheduled MIDI messages first
    output.midiOutput.clear();
    // Then send immediate note-off commands
    output.midiOutput.send([176, 64, 0]);   // Sustain pedal off
    output.midiOutput.send([176, 121, 0]);  // Reset all controllers
    output.midiOutput.send([176, 123, 0]);  // All notes off
  } else if (output.synth) {
    output.synth.stopAll(true);
  }
}
