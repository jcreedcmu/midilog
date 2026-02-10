#!/usr/bin/env node
// One-time migration: log/*.json → data/index.json + data/log/<hash>.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logDir = path.resolve(__dirname, 'log');
const dataDir = path.resolve(__dirname, 'data');
const dataLogDir = path.join(dataDir, 'log');
const indexPath = path.join(dataDir, 'index.json');

function contentHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function durationFromEvents(events) {
  let total_us = 0;
  for (const event of events) {
    const midi_us = event.delta.midi_us > 0x100000000 ? 0 : event.delta.midi_us;
    total_us += midi_us;
  }
  return total_us / 1000;
}

fs.mkdirSync(dataLogDir, { recursive: true });

const files = fs.readdirSync(logDir).filter(f => f.endsWith('.json')).sort();
const index = [];

for (const file of files) {
  const date = file.replace(/\.json$/, '');
  const chunks = JSON.parse(fs.readFileSync(path.join(logDir, file), 'utf8'));

  for (let ix = 0; ix < chunks.length; ix++) {
    const chunk = chunks[ix];
    const eventsJson = JSON.stringify(chunk.events);
    const hash = contentHash(eventsJson);
    const contentPath = path.join(dataLogDir, hash + '.json');

    if (!fs.existsSync(contentPath)) {
      fs.writeFileSync(contentPath, eventsJson, 'utf8');
    }

    const entry = {
      date,
      ix,
      start: chunk.start,
      duration_ms: durationFromEvents(chunk.events),
      hash,
    };
    if (chunk.uuid) entry.uuid = chunk.uuid;
    if (chunk.tags && chunk.tags.length > 0) entry.tags = chunk.tags;

    index.push(entry);
  }

  console.log(`${file}: ${chunks.length} chunks`);
}

index.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ix - b.ix);
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n', 'utf8');

console.log(`\nDone: ${index.length} entries in index, content files in data/log/`);
