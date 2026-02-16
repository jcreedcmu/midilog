import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { eventsToMidi } from '../src/midi-codec.ts';

const dataDir = path.join(import.meta.dirname, '..', 'data');
const indexPath = path.join(dataDir, 'index.json');
const logDir = path.join(dataDir, 'log');

const cleanup = process.argv.includes('--cleanup');

function contentHash(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

// Collect unique hashes
const uniqueHashes = new Set<string>();
for (const entry of index) {
  uniqueHashes.add(entry.hash);
}

// Build mapping from old hash to new hash
const hashMap = new Map<string, string>();
let converted = 0;
let skipped = 0;

for (const oldHash of uniqueHashes) {
  const jsonPath = path.join(logDir, oldHash + '.json');
  const midPath = path.join(logDir, oldHash + '.mid');

  // If .mid already exists, this hash was already migrated or is a new-format file
  if (fs.existsSync(midPath)) {
    hashMap.set(oldHash, oldHash);
    skipped++;
    continue;
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`Warning: missing CAS file for hash ${oldHash}`);
    hashMap.set(oldHash, oldHash);
    continue;
  }

  const events = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const midiBytes = eventsToMidi(events);
  const newHash = contentHash(midiBytes);

  const newMidPath = path.join(logDir, newHash + '.mid');
  if (!fs.existsSync(newMidPath)) {
    fs.writeFileSync(newMidPath, midiBytes);
  }

  hashMap.set(oldHash, newHash);
  converted++;
  console.log(`${oldHash}.json -> ${newHash}.mid`);
}

// Update index entries
let indexChanged = false;
for (const entry of index) {
  const newHash = hashMap.get(entry.hash);
  if (newHash && newHash !== entry.hash) {
    entry.hash = newHash;
    indexChanged = true;
  }
}

if (indexChanged) {
  index.sort((a: any, b: any) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ix - b.ix);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n', 'utf8');
  console.log('Updated data/index.json');
}

// Cleanup old JSON files
if (cleanup) {
  let deleted = 0;
  for (const oldHash of uniqueHashes) {
    const jsonPath = path.join(logDir, oldHash + '.json');
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
      deleted++;
    }
  }
  console.log(`Deleted ${deleted} old .json CAS files`);
}

console.log(`Done: ${converted} converted, ${skipped} skipped`);
