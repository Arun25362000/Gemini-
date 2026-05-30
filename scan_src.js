import fs from 'fs';
import path from 'path';

function scanDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else {
        console.log(`FILE: ${fullPath}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
      }
    }
  } catch (e) {}
}

scanDir('src');
