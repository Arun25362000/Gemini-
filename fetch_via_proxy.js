import https from 'https';
import fs from 'fs';

function downloadFile(proxyUrl, destPath) {
  return new Promise((resolve) => {
    console.log(`Downloading via proxy to ${destPath}...`);
    https.get(proxyUrl, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        console.log(`Failed with status: ${res.statusCode}`);
        resolve(false);
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const stat = fs.statSync(destPath);
        console.log(`Downloaded ${destPath}, size=${stat.size}`);
        resolve(true);
      });
    }).on('error', (err) => {
      console.log(`Error downloading via proxy: ${err.message}`);
      resolve(false);
    });
  });
}

async function run() {
  const targetUrl = 'https://ais-pre-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app/logo.png';
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
  await downloadFile(proxy, 'restored_logo.png');
}

run();
