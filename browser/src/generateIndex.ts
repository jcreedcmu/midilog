import * as fs from 'fs';
import * as path from 'path';

const metadata: { file: string, lines: number }[] = [];
const logDir = path.resolve(__dirname, '../../log');
const files = fs.readdirSync(logDir);
files.forEach(file => {
  const lines = fs.readFileSync(path.join(logDir, file), 'utf8').split('\n').filter(x => x.length > 0).length
  metadata.push({ file, lines });
});
fs.writeFileSync(path.join(logDir, '../logIndex.json'), JSON.stringify(metadata), 'utf8');
