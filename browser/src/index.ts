import express from 'express';
import * as path from 'path';
import serveIndex from 'serve-index';

const app = express();

console.log(__dirname);
app.use('/log', serveIndex(__dirname + '/../../log'));
app.use('/log', express.static(__dirname + '/../../log'));

app.get('/js/logger.js', (req, res) => { res.sendFile(path.resolve(__dirname, 'logger.js')) });
app.get('/logIndex.json', (req, res) => { res.sendFile(path.resolve(__dirname, '../../logIndex.json')) });
app.get('/', express.static(path.resolve(__dirname, '../public')));


const port = process.env.PORT ?? 8000;
app.listen(port, () => {
  console.log(`listening on port ${port}...`);
});
