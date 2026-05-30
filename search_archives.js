import fs from 'fs';
import path from 'path';

function findArchives(dir) {
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
        findArchives(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.zip', '.tar', '.tgz', '.gz', '.bz2', '.xz'].includes(ext)) {
          console.log(`FOUND ARCHIVE: ${fullPath}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
        }
      }
    }
  } catch (err) {}
}

console.log('Starting scan for archives...');
findArchives('/');
console.log('Scan finished.');
