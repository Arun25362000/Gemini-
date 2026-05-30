import fs from 'fs';
import path from 'path';

function listRecursive(dir, maxDepth=3, currentDepth=0) {
  if (currentDepth > maxDepth) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      console.log(`${' '.repeat(currentDepth * 2)}- ${fullPath} (dir=${stat.isDirectory()}, size=${stat.size})`);
      if (stat.isDirectory()) {
        listRecursive(fullPath, maxDepth, currentDepth + 1);
      }
    }
  } catch (err) {
    // console.log(`Error reading ${dir}: ${err.message}`);
  }
}

console.log('--- Scanning /workspace recursively ---');
listRecursive('/workspace');
console.log('--- Scanning /root recursively ---');
listRecursive('/root');
