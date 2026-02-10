import * as fs from 'fs';
import * as crypto from 'crypto';
import express from 'express';
import * as path from 'path';

const app = express();
app.use(express.json({ limit: '10mb' }));

const dataDir = path.resolve(__dirname, '../data');
const dataLogDir = path.join(dataDir, 'log');
const indexPath = path.join(dataDir, 'index.json');

type IndexEntry = {
  date: string;
  ix: number;
  start: string;
  duration_ms: number;
  hash: string;
  uuid?: string;
  tags?: { label: string; start_ms: number; end_ms: number }[];
};

function contentHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function readIndex(): IndexEntry[] {
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function writeIndex(entries: IndexEntry[]): void {
  entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ix - b.ix);
  fs.writeFileSync(indexPath, JSON.stringify(entries, null, 1) + '\n', 'utf8');
}

function durationFromEvents(events: any[]): number {
  let total_us = 0;
  for (const event of events) {
    const midi_us = event.delta.midi_us > 0x100000000 ? 0 : event.delta.midi_us;
    total_us += midi_us;
  }
  return total_us / 1000;
}

console.log(__dirname);

app.get('/js/logger.js', (req, res) => { res.sendFile(path.resolve(__dirname, 'logger.js')) });
app.get('/js/logger.js.map', (req, res) => { res.sendFile(path.resolve(__dirname, 'logger.js.map')) });
app.get('/js/spessasynth_processor.min.js', (req, res) => {
  const filePath = path.resolve(__dirname, '../node_modules/spessasynth_lib/dist/spessasynth_processor.min.js');
  console.log('Serving worklet from:', filePath);
  res.type('application/javascript');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending worklet file:', err);
      res.status(404).send('Worklet file not found');
    }
  });
});
app.use('/soundfont', express.static(path.resolve(__dirname, '../soundfont')));
app.use('/icons', express.static(path.resolve(__dirname, '../public/icons')));

app.get('/log/:file', (req, res) => {
  const file = req.params.file;
  const date = file.replace(/\.json$/, '');
  const index = readIndex();
  const entries = index.filter(e => e.date === date);
  entries.sort((a, b) => a.ix - b.ix);
  const songs = entries.map(entry => {
    const contentPath = path.join(dataLogDir, entry.hash + '.json');
    const events = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    const song: any = { start: entry.start, events };
    if (entry.uuid) song.uuid = entry.uuid;
    if (entry.tags) song.tags = entry.tags;
    return song;
  });
  res.json(songs);
});

app.get('/logIndex.json', (req, res) => {
  const index = readIndex();
  const groups = new Map<string, { durations_ms: number[] }>();
  for (const entry of index) {
    const file = entry.date + '.json';
    let group = groups.get(file);
    if (!group) {
      group = { durations_ms: [] };
      groups.set(file, group);
    }
    group.durations_ms.push(entry.duration_ms);
  }
  const metadata: { file: string, lines: number, durations_ms: number[] }[] = [];
  for (const [file, group] of groups) {
    metadata.push({ file, lines: group.durations_ms.length, durations_ms: group.durations_ms });
  }
  res.json(metadata);
});

app.use(express.static(path.resolve(__dirname, '../public')));

app.post('/api/save', (req, res) => {
  const { song, file, ix } = req.body;
  const date = file.replace(/\.json$/, '');
  const eventsJson = JSON.stringify(song.events);
  const hash = contentHash(eventsJson);
  const contentPath = path.join(dataLogDir, hash + '.json');

  // Write content file (skip if already exists — content-addressable)
  if (!fs.existsSync(contentPath)) {
    fs.mkdirSync(dataLogDir, { recursive: true });
    fs.writeFileSync(contentPath, eventsJson, 'utf8');
  }

  const duration_ms = durationFromEvents(song.events);
  const index = readIndex();

  // Find existing entry or create new one
  const existing = index.findIndex(e => e.date === date && e.ix === ix);
  const entry: IndexEntry = {
    date,
    ix,
    start: song.start,
    duration_ms,
    hash,
  };
  if (song.uuid) entry.uuid = song.uuid;
  if (song.tags && song.tags.length > 0) entry.tags = song.tags;

  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }

  writeIndex(index);
  res.json({ ok: true });
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => {
  console.log(`listening on port ${port}...`);
});
