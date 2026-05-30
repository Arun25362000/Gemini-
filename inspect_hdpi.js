import fs from 'fs';

function inspect(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    console.log(`${filePath} hex header:`, buf.toString('hex'));
  } catch (err) {
    console.error(`Error inspecting ${filePath}:`, err.message);
  }
}

inspect('/app/applet/android/app/src/main/res/mipmap-hdpi/ic_launcher_unnati.png');
inspect('/app/applet/android/app/src/main/res/mipmap-hdpi/ic_launcher_unnati_foreground.png');
inspect('/app/applet/android/app/src/main/res/mipmap-hdpi/ic_launcher_app.png');
inspect('/app/applet/android/app/src/main/res/mipmap-hdpi/ic_launcher.png');
