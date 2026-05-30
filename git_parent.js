import { execSync } from 'child_process';
import fs from 'fs';

function runCmd(cmd, cwd) {
  try {
    console.log(`Running "${cmd}" in ${cwd}...`);
    const out = execSync(cmd, { cwd, encoding: 'utf8' });
    console.log(out.slice(0, 1000));
  } catch (err) {
    console.log(`Failed inside ${cwd}:`, err.message);
  }
}

runCmd('git status', '/');
runCmd('git status', '/app');
runCmd('git status', '/app/applet');
runCmd('git status', '/workspace');
