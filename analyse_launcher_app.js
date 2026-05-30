import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function check() {
  const p = '/app/applet/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_app.png';
  if (fs.existsSync(p)) {
    try {
      const meta = await sharp(p).metadata();
      console.log('ic_launcher_app.png metadata:', meta);
    } catch (err) {
      console.error('Error analyzing ic_launcher_app:', err.message);
    }
  } else {
    console.log('ic_launcher_app.png does not exist at path');
  }
}
check();
