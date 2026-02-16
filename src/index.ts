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
  deleted?: boolean;
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
  res.json(readIndex());
});

app.use(express.static(path.resolve(__dirname, '../public')));

// Store note events, return hash
app.post('/api/content', (req, res) => {
  const { events } = req.body;
  const eventsJson = JSON.stringify(events);
  const hash = contentHash(eventsJson);
  const contentPath = path.join(dataLogDir, hash + '.json');
  if (!fs.existsSync(contentPath)) {
    fs.mkdirSync(dataLogDir, { recursive: true });
    fs.writeFileSync(contentPath, eventsJson, 'utf8');
  }
  res.json({ hash });
});

// Save index entry as-is
app.post('/api/save', (req, res) => {
  const entry: IndexEntry = req.body;
  const index = readIndex();
  const existing = index.findIndex(e => e.date === entry.date && e.ix === entry.ix);
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
