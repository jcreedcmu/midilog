import * as fs from 'fs';
import express from 'express';
import * as path from 'path';
import serveIndex from 'serve-index';

const app = express();
app.use(express.json());

console.log(__dirname);
app.use('/log', serveIndex(__dirname + '/../log'));
app.use('/log', express.static(__dirname + '/../log'));

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
app.get('/logIndex.json', (req, res) => {

  const metadata: { file: string, lines: number, durations_ms: number[] }[] = [];
  const logDir = path.resolve(__dirname, '../log');
  const files = fs.readdirSync(logDir);
  files.forEach(file => {
    const chunks = fs.readFileSync(path.join(logDir, file), 'utf8').split('\n').filter(x => x.length > 0);
    const durations_ms = chunks.map(line => {
      const chunk = JSON.parse(line);
      let total_us = 0;
      for (const event of chunk.events) {
        const midi_us = event.delta.midi_us > 0x100000000 ? 0 : event.delta.midi_us;
        total_us += midi_us;
      }
      return total_us / 1000;
    });
    metadata.push({ file, lines: chunks.length, durations_ms });
  });
  res.json(metadata);

});
app.use(express.static(path.resolve(__dirname, '../public')));

app.post('/api/save', (req, res) => {
  const basename = (new Date()).toJSON().replace(/T.*/, '');
  console.log(JSON.stringify(req.body, null, 2));
  fs.appendFileSync(
    path.resolve(__dirname, `../log/${basename}.json`),
    JSON.stringify(req.body) + '\n',
    'utf8'
  );
  res.json({ ok: true });
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => {
  console.log(`listening on port ${port}...`);
});
