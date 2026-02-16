#!/usr/bin/env node

// Finds and deletes .json files in data/log/ that aren't referenced by data/index.json

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const indexPath = path.join(dataDir, 'index.json');
const logDir = path.join(dataDir, 'log');

const dryRun = !process.argv.includes('--delete');

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const referencedHashes = new Set(index.map(entry => entry.hash));

const files = fs.readdirSync(logDir).filter(f => f.endsWith('.json'));
const orphans = files.filter(f => !referencedHashes.has(f.replace('.json', '')));

if (orphans.length === 0) {
  console.log('No orphaned files found.');
  process.exit(0);
}

console.log(`Found ${orphans.length} orphaned file(s):`);
for (const f of orphans) {
  const fullPath = path.join(logDir, f);
  console.log(`  ${f}`);
  if (!dryRun) {
    fs.unlinkSync(fullPath);
    console.log(`    deleted`);
  }
}

if (dryRun) {
  console.log('\nDry run — pass --delete to actually remove them.');
}
