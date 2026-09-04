// Enumerate every utility Tailwind emitted inside a given breakpoint's media
// query, and compare against what Home.jsx actually asks for.
// usage: node bpcheck.js <built.css> <breakpointPx> <source.jsx>
const fs = require('fs');
const [cssPath, bp, srcPath] = process.argv.slice(2);
const css = fs.readFileSync(cssPath, 'utf8');

const mq = new RegExp('@media\\s*\\(min-width:\\s*' + bp + 'px\\)').exec(css);
if (!mq) { console.log('NO ' + bp + 'px MEDIA QUERY'); process.exit(1); }

let depth = 0, end = css.indexOf('{', mq.index);
for (; end < css.length; end++) {
  if (css[end] === '{') depth++;
  else if (css[end] === '}') { depth--; if (depth === 0) break; }
}
const block = css.slice(mq.index, end + 1);

// In the CSS the class is escaped: .min-\[930px\]\:hidden
const emitted = new Set();
const reEmit = new RegExp('min-\\\\\\[' + bp + 'px\\\\\\]\\\\:([a-zA-Z0-9_-]+)', 'g');
let m;
while ((m = reEmit.exec(block))) emitted.add(m[1]);

const src = fs.readFileSync(srcPath, 'utf8');
const used = new Set();
const reUse = new RegExp('min-\\[' + bp + 'px\\]:([a-zA-Z0-9_-]+)', 'g');
while ((m = reUse.exec(src))) used.add(m[1]);

console.log('media block : ' + block.length + ' bytes at char ' + mq.index);
console.log('emitted     : ' + [...emitted].sort().join(', '));
console.log('');
let missing = 0;
for (const u of [...used].sort()) {
  const ok = emitted.has(u);
  if (!ok) missing++;
  console.log('  ' + (ok ? 'ok      ' : 'MISSING ') + 'min-[' + bp + 'px]:' + u);
}
console.log('');
const track = /grid-template-columns:(minmax\([^;}]*)/.exec(block);
console.log('grid track  : ' + (track ? track[1] : 'NO GRID TRACK IN BLOCK'));
console.log(missing === 0 ? 'ALL UTILITIES COMPILED' : missing + ' MISSING');
