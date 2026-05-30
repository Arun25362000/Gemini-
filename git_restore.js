import { execSync } from 'child_process';

try {
  console.log('--- Git status ---');
  console.log(execSync('git status', { encoding: 'utf8' }));

  console.log('--- Git log for public/logo.png ---');
  console.log(execSync('git log --oneline -- public/logo.png', { encoding: 'utf8' }));
  
  console.log('--- Git log for public/Logoold.png ---');
  console.log(execSync('git log --oneline -- public/Logoold.png', { encoding: 'utf8' }));
} catch (err) {
  console.error('Error running git commands:', err.message);
}
