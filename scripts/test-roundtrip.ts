import * as fs from 'fs';
import { eventsToMidi, midiToEvents } from '../src/midi-codec.ts';

const logDir = './data/log';
const files = fs.readdirSync(logDir).filter(f => f.endsWith('.json'));
let totalFiles = 0, problemFiles = 0;

for (const file of files) {
  const jsonData = JSON.parse(fs.readFileSync(logDir + '/' + file, 'utf8'));
  // Filter to only channel messages (status < 0xF0) for fair comparison,
  // since the encoder now skips system messages
  const channelEvents = jsonData.filter((e: any) => e.message[0] < 0xf0);

  const midi = eventsToMidi(jsonData);
  const decoded = midiToEvents(midi);

  // Compare total durations (including system message deltas, which get folded in)
  let origTotal = 0, decTotal = 0;
  for (const e of jsonData) {
    origTotal += e.delta.midi_us > 0x100000000 ? 0 : e.delta.midi_us;
  }
  for (const e of decoded) {
    decTotal += e.delta.midi_us;
  }

  let diffs = 0;
  if (channelEvents.length !== decoded.length) diffs++;
  // Compare messages
  for (let i = 0; i < Math.min(channelEvents.length, decoded.length); i++) {
    if (JSON.stringify(channelEvents[i].message) !== JSON.stringify(decoded[i].message)) diffs++;
  }
  // Check total duration matches
  if (origTotal !== decTotal) diffs++;

  totalFiles++;
  if (diffs > 0) {
    const skipped = jsonData.length - channelEvents.length;
    console.log(file + ': ch_events ' + channelEvents.length + '->' + decoded.length +
      ' (skipped ' + skipped + ' sys)' +
      ', diffs=' + diffs +
      ', dur ' + (origTotal / 1e6).toFixed(3) + 's -> ' + (decTotal / 1e6).toFixed(3) + 's');
    problemFiles++;
  }
}
console.log('Tested ' + totalFiles + ' files, ' + problemFiles + ' with problems');
