import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('/root');
files.forEach(f => {
  if (f.startsWith('.') && f.includes('history')) {
    console.log(`FOUND HISTORY FILE: /root/${f}`);
    try {
      const content = fs.readFileSync(path.join('/root', f), 'utf8');
      console.log(content.slice(-2000)); // print last 2000 chars
    } catch (e) {
      console.log(`Error reading ${f}`);
    }
  }
});
