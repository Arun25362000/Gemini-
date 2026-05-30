import fs from 'fs';
import path from 'path';

const distPaths = [
  '/app/applet/dist/logo.png',
  '/app/applet/dist/Logoold.png',
  '/app/applet/dist/icon.png',
  '/app/applet/assets/icon.png'
];

distPaths.forEach(p => {
  if (fs.existsSync(p)) {
    const stat = fs.statSync(p);
    console.log(`FOUND: ${p}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
  } else {
    console.log(`NOT FOUND: ${p}`);
  }
});
