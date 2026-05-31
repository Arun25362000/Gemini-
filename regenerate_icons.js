import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = 'public/brand-unnati-official.png';

const DENSITIES = {
  'mdpi': { icon: 48, foreground: 108 },
  'hdpi': { icon: 72, foreground: 162 },
  'xhdpi': { icon: 96, foreground: 216 },
  'xxhdpi': { icon: 144, foreground: 324 },
  'xxxhdpi': { icon: 192, foreground: 432 }
};

async function processIcons() {
  console.log('--- REGENERATING ANDROID ICONS FROM MASTER ---');
  
  if (!fs.existsSync(SRC)) {
      console.error(`ERROR: Master file ${SRC} not found!`);
      process.exit(1);
  }

  for (const [density, sizes] of Object.entries(DENSITIES)) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Standard icons
    const iconFiles = [
      'ic_launcher.png',
      'ic_launcher_round.png',
      'ic_launcher_unnati.png',
      'ic_launcher_unnati_round.png',
      'ic_launcher_app.png',
      'ic_launcher_app_round.png'
    ];

    for (const f of iconFiles) {
      const targetPath = path.join(dir, f);
      await sharp(SRC).resize(sizes.icon, sizes.icon).toFile(targetPath);
      console.log(`  Updated ${density}/${f}`);
    }

    // Adaptive Foreground
    const foregroundFiles = [
      'ic_launcher_foreground.png',
      'ic_launcher_unnati_foreground.png',
      'ic_launcher_app_foreground.png'
    ];

    for (const f of foregroundFiles) {
      const targetPath = path.join(dir, f);
      await sharp(SRC).resize(sizes.foreground, sizes.foreground).toFile(targetPath);
      console.log(`  Updated ${density}/${f}`);
    }
  }

  // Handle Splash in all drawables
  const resDir = 'android/app/src/main/res';
  const drawables = fs.readdirSync(resDir).filter(d => d.startsWith('drawable'));
  
  for (const dirName of drawables) {
     const p = path.join(resDir, dirName, 'splash.png');
     try {
         // Create a 2732x2732 white splash with centered logo
         await sharp({
             create: {
                 width: 1024,
                 height: 1024,
                 channels: 4,
                 background: { r: 255, g: 255, b: 255, alpha: 1 }
             }
         })
         .composite([{ 
             input: await sharp(SRC).resize(512, 512, { fit: 'contain' }).toBuffer(), 
             gravity: 'center' 
         }])
         .png()
         .toFile(p);
         console.log(`Updated Splash: ${dirName}/splash.png`);
     } catch (e) {
         console.log(`Skipped Splash ${dirName}: ${e.message}`);
     }
  }

  console.log('--- ICON REGENERATION COMPLETE ---');
}

processIcons().catch(console.error);
