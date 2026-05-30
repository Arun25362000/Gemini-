import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const logoPath = '/app/applet/public/logo.png';
const assetsDir = '/app/applet/assets';

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

async function run() {
  console.log('Generating master assets from public/logo.png...');

  // 1. Generate icon.png (1024x1024, transparent background, centered)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(path.join(assetsDir, 'icon.png'));
  console.log('Generated assets/icon.png');

  // 2. Generate icon-foreground.png (1024x1024, safely scaled within 66% circular area)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(600, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(path.join(assetsDir, 'icon-foreground.png'));
  console.log('Generated assets/icon-foreground.png');

  // 3. Generate icon-background.png (1024x1024, white background for clean adaptive rendering)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .png()
  .toFile(path.join(assetsDir, 'icon-background.png'));
  console.log('Generated assets/icon-background.png');

  // 4. Generate splash.png (2732x2732, white background with centered logo)
  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(1000, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(path.join(assetsDir, 'splash.png'));
  console.log('Generated assets/splash.png');

  // Execute capacitor assets generate command
  console.log('Running @capacitor/assets generate --android...');
  execSync('npx @capacitor/assets generate --android', { cwd: '/app/applet', stdio: 'inherit' });
  console.log('Assets successfully synchronized to Android platform!');
}

run().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
