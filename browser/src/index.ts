import * as fs from 'fs';
import express from 'express';
import * as path from 'path';
import serveIndex from 'serve-index';

const app = express();
app.use(express.json());

console.log(__dirname);
app.use('/log', serveIndex(__dirname + '/../../log'));
app.use('/log', express.static(__dirname + '/../../log'));

app.get('/js/logger.js', (req, res) => { res.sendFile(path.resolve(__dirname, 'logger.js')) });
app.get('/js/logger.js.map', (req, res) => { res.sendFile(path.resolve(__dirname, 'logger.js.map')) });
app.get('/logIndex.json', (req, res) => {

  const metadata: { file: string, lines: number }[] = [];
  const logDir = path.resolve(__dirname, '../../log');
  const files = fs.readdirSync(logDir);
  files.forEach(file => {
    const lines = fs.readFileSync(path.join(logDir, file), 'utf8').split('\n').filter(x => x.length > 0).length
    metadata.push({ file, lines });
  });
  res.json(metadata);

});
app.get('/', express.static(path.resolve(__dirname, '../public')));

app.post('/api/save', (req, res) => {
  const basename = (new Date()).toJSON().replace(/T.*/, '');
  console.log(JSON.stringify(req.body, null, 2));
  fs.appendFileSync(
    path.resolve(__dirname, `../../log/${basename}.json`),
    JSON.stringify(req.body) + '\n',
    'utf8'
  );
  res.json({ ok: true });
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => {
  console.log(`listening on port ${port}...`);
});
