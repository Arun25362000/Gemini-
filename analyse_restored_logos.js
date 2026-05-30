import sharp from 'sharp';

async function check() {
  try {
    const fresh = await sharp('/app/applet/android/app/src/main/assets/public/logo.png').metadata();
    console.log('logo.png in android assets:', fresh);
    const old = await sharp('/app/applet/android/app/src/main/assets/public/Logoold.png').metadata();
    console.log('Logoold.png in android assets:', old);
  } catch (err) {
    console.error('Error analyzing android assets:', err);
  }
}
check();
