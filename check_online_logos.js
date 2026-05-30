import https from 'https';

function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`URL: ${url}`);
      console.log(`  status: ${res.statusCode}`);
      console.log(`  content-length: ${res.headers['content-length']}`);
      console.log(`  headers:`, res.headers);
      resolve();
    }).on('error', (err) => {
      console.error(`  error: ${err.message}`);
      resolve();
    });
  });
}

async function run() {
  await checkUrl('https://ais-pre-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app/logo.png');
  await checkUrl('https://ais-dev-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app/logo.png');
}

run();
