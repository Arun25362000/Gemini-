import fs from 'fs';
import https from 'https';

async function fetchHome() {
  https.get('https://unnatifin.co', (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      // Find all image tags or files
      const regex = /["']([^"']+\.(png|jpg|jpeg|svg|webp)[^"']*)["']/g;
      let match;
      const urls = new Set();
      while ((match = regex.exec(data)) !== null) {
        urls.add(match[1]);
      }
      console.log('Found image URLs on website:');
      urls.forEach(u => console.log('  ', u));
    });
  });
}

fetchHome();
