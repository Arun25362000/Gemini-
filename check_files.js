import fs from 'fs';
import path from 'path';

console.log('Public folder:');
fs.readdirSync('public').forEach(file => {
  const stat = fs.statSync(path.join('public', file));
  console.log(`  ${file}: size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
});

console.log('Assets folder:');
fs.readdirSync('assets').forEach(file => {
  const stat = fs.statSync(path.join('assets', file));
  console.log(`  ${file}: size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
});
