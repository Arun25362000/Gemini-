import sharp from 'sharp';

async function check() {
  try {
    const meta = await sharp('/app/applet/assets/icon.png').metadata();
    console.log('assets/icon.png metadata:', meta);
    const pm = await sharp('/app/applet/public/logo.png').metadata();
    console.log('public/logo.png metadata:', pm);
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
