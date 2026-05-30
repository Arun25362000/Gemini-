import fs from 'fs';
import path from 'path';

function listDirContents(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      console.log(`Contents of ${dirPath}:`);
      fs.readdirSync(dirPath).forEach(f => {
        try {
          const stat = fs.statSync(path.join(dirPath, f));
          console.log(`  ${f}: dir=${stat.isDirectory()}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
        } catch (e) {
          console.log(`  ${f}: error reading stat`);
        }
      });
    } else {
      console.log(`${dirPath} does not exist.`);
    }
  } catch (err) {
    console.error(`Error listing ${dirPath}:`, err.message);
  }
}

listDirContents('/www-data-home');
