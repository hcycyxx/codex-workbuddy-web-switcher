import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
let checked = 0;
for (const dir of ['src', 'public', 'vendor', 'tests', 'scripts']) {
  for (const file of await readdir(dir)) if (file.endsWith('.js')) {
    execFileSync(process.execPath, ['--check', join(dir, file)], { stdio: 'pipe', windowsHide: true }); checked++;
  }
}
console.log(`${checked} JavaScript files parsed successfully.`);
