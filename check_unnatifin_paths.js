import https from 'https';

const paths = [
  'https://unnatifin.co/logo.png',
  'https://unnatifin.co/Logoold.png',
  'https://unnatifin.co/favicon.png',
  'https://unnatifin.co/favicon.ico'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`URL: ${url}`);
      console.log(`  status: ${res.statusCode}`);
      console.log(`  content-length: ${res.headers['content-length']}`);
      resolve();
    }).on('error', (err) => {
      console.error(`  error ${url}: ${err.message}`);
      resolve();
    });
  });
}

async function run() {
  for (const url of paths) {
    await checkUrl(url);
  }
}

run();
