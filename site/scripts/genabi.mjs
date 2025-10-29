import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..', 'fhevm-hardhat-template');
const src = path.join(root, 'deployments');
const dst = path.join(process.cwd(), 'public', 'abi');

fs.mkdirSync(dst, { recursive: true });

function copyDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const sp = path.join(dir, e.name);
    const rel = path.relative(src, sp);
    const dp = path.join(dst, rel);
    if (e.isDirectory()) {
      fs.mkdirSync(dp, { recursive: true });
      copyDir(sp);
    } else if (e.isFile() && e.name === 'FestivalRegistry.json') {
      fs.mkdirSync(path.dirname(dp), { recursive: true });
      fs.copyFileSync(sp, dp);
      console.log('copied', rel);
    }
  }
}

if (fs.existsSync(src)) {
  copyDir(src);
  console.log('Done.');
} else {
  console.error('No deployments folder found, did you deploy?');
  process.exit(1);
}
