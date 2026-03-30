const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join('src', 'data', 'usda', 'vectors.json');
try {
  const raw = fs.readFileSync(target, 'utf8');
  JSON.parse(raw);
  console.log('OK: JSON parsed successfully');
} catch (err) {
  console.error('JSON parse error:', err.message);
  if (err instanceof SyntaxError) {
    const m = err.message.match(/at position (\d+)/);
    let pos = null;
    if (m) pos = parseInt(m[1], 10);
    // Node V8 may include position differently; try to extract from stack
    if (pos == null && err.stack) {
      const s = err.stack.match(/char (\d+)/);
      if (s) pos = parseInt(s[1], 10);
    }
    if (pos != null) {
      const start = Math.max(0, pos - 80);
      const end = pos + 80;
      const raw = fs.readFileSync(target, 'utf8');
      console.error('\nContext around error (index ' + pos + '):\n');
      console.error(raw.slice(start, end).replace(/\n/g, '\\n'));
    }
  }
  process.exitCode = 1;
}
