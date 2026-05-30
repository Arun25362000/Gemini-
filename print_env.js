import fs from 'fs';
console.log('--- Environment variables ---');
Object.keys(process.env).forEach(key => {
  if (!key.includes('KEY') && !key.includes('PASSWORD') && !key.includes('SECRET')) {
    console.log(`  ${key}=${process.env[key]}`);
  }
});
