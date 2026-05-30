import https from 'https';

function testNetwork(url) {
  return new Promise((resolve) => {
    console.log(`Testing outbound request to ${url}...`);
    const req = https.get(url, { timeout: 3000 }, (res) => {
      console.log(`SUCCESS: ${url} returned status ${res.statusCode}`);
      resolve(true);
    });
    
    req.on('timeout', () => {
      console.log(`TIMEOUT: ${url} timed out`);
      req.destroy();
      resolve(false);
    });
    
    req.on('error', (err) => {
      console.log(`ERROR: ${url} failed with ${err.message}`);
      resolve(false);
    });
  });
}

testNetwork('https://www.google.com');
