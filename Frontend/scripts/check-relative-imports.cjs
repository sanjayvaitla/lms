const fs = require('fs');
const path = require('path');

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const root = path.join(__dirname, '..', 'src');
const files = walk(root);
const importRe = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
const missing = [];

for (const f of files) {
  let txt = fs.readFileSync(f, 'utf8');
  // Strip comments so paths inside docs don't false-positive
  txt = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  let m;
  while ((m = importRe.exec(txt))) {
    const rel = m[1];
    const base = path.dirname(f);
    const candidates = [
      rel,
      rel + '.ts',
      rel + '.tsx',
      rel + '.js',
      rel + '.jsx',
      path.join(rel, 'index.ts'),
      path.join(rel, 'index.tsx'),
      path.join(rel, 'index.js'),
    ];
    const ok = candidates.some((c) => fs.existsSync(path.resolve(base, c)));
    if (!ok) {
      missing.push(path.relative(root, f).replace(/\\/g, '/') + ' -> ' + rel);
    }
  }
}

if (missing.length) {
  console.log('MISSING IMPORTS:');
  missing.forEach((x) => console.log(x));
  process.exit(1);
} else {
  console.log('OK: no missing relative imports under src/');
}
