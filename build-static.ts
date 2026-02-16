import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { midiToEvents } from './src/midi-codec.ts';

const dist = './dist';

// Clean and create dist directory
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true });
}
fs.mkdirSync(dist, { recursive: true });

// Read the data index
const index = JSON.parse(fs.readFileSync('./data/index.json', 'utf8'));

// Generate logIndex.json (same format as server's /logIndex.json endpoint)
fs.writeFileSync(path.join(dist, 'logIndex.json'), JSON.stringify(index));

// Generate log/*.json files (same format as server's /log/:file endpoint)
fs.mkdirSync(path.join(dist, 'log'), { recursive: true });
const dateGroups = new Map();
for (const entry of index) {
  let entries = dateGroups.get(entry.date);
  if (!entries) {
    entries = [];
    dateGroups.set(entry.date, entries);
  }
  entries.push(entry);
}
for (const [date, entries] of dateGroups) {
  entries.sort((a, b) => a.ix - b.ix);
  const songs = entries.map(entry => {
    const contentPath = path.join('./data/log', entry.hash + '.mid');
    const events = midiToEvents(fs.readFileSync(contentPath));
    const song = { start: entry.start, events };
    if (entry.uuid) song.uuid = entry.uuid;
    if (entry.tags) song.tags = entry.tags;
    return song;
  });
  fs.writeFileSync(path.join(dist, 'log', date + '.json'), JSON.stringify(songs));
}

// Copy static assets
fs.copyFileSync('./public/index.html', path.join(dist, 'index.html'));
fs.copyFileSync('./public/app.css', path.join(dist, 'app.css'));

// Copy icons
const iconsDir = path.join(dist, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
for (const file of fs.readdirSync('./public/icons')) {
  fs.copyFileSync(path.join('./public/icons', file), path.join(iconsDir, file));
}

// Copy soundfont
const sfDir = path.join(dist, 'soundfont');
fs.mkdirSync(sfDir, { recursive: true });
fs.copyFileSync('./soundfont/gm-good.sf3', path.join(sfDir, 'gm-good.sf3'));

// Copy spessasynth worklet processor
const jsDir = path.join(dist, 'js');
fs.mkdirSync(jsDir, { recursive: true });
fs.copyFileSync(
  './node_modules/spessasynth_lib/dist/spessasynth_processor.min.js',
  path.join(jsDir, 'spessasynth_processor.min.js')
);

// Build browser bundle with READONLY=true
await esbuild.build({
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  entryPoints: ['./src/logger.ts'],
  outfile: path.join(jsDir, 'logger.js'),
  define: { READONLY: 'true' },
});

console.log('Static site built in dist/');
