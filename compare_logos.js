import fs from 'fs';

function compare(file1, file2) {
  try {
    const b1 = fs.readFileSync(file1);
    const b2 = fs.readFileSync(file2);
    if (b1.equals(b2)) {
      console.log(`${file1} and ${file2} are identical (same size and bytes)`);
    } else {
      console.log(`${file1} and ${file2} are DIFFERENT`);
    }
  } catch (err) {
    console.error(`Error comparing: ${err.message}`);
  }
}

compare('/app/applet/public/logo.png', '/app/applet/assets/icon.png');
