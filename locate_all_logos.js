import fs from 'fs';
import path from 'path';

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        const basename = path.basename(fullPath);
        if (dir === '/' && ['proc', 'sys', 'dev', 'var', 'lib', 'usr', 'bin', 'sbin', 'etc', 'home', 'run'].includes(basename)) continue;
        if (basename === 'node_modules' || basename === '.git') continue;
        scan(fullPath);
      } else {
        if (file.toLowerCase().includes('logo') || stat.size === 43523 || stat.size === 1435757 || file.toLowerCase().includes('icon')) {
          console.log(`FOUND FILE: ${fullPath}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
        }
      }
    }
  } catch (err) {
    // skip
  }
}

console.log('Starting full scan...');
scan('/');
console.log('Scan finished.');
