import fs from 'fs';
import path from 'path';

function findGit(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (file === '.git') {
        console.log('FOUND GIT DIR:', fullPath);
      }
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        const basename = path.basename(fullPath);
        if (dir === '/' && ['proc', 'sys', 'dev', 'var', 'lib', 'usr', 'bin', 'sbin', 'etc', 'home', 'run'].includes(basename)) continue;
        if (basename === 'node_modules' && dir !== '.') continue;
        findGit(fullPath);
      }
    }
  } catch (err) {}
}

findGit('/');
