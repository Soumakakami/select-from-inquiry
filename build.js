const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let html = src('index.html');
html = html.replace('/*__CSS__*/', () => src('style.css'))
  .replace('/*__DATAGEN__*/', () => src('datagen.js'))
  .replace('/*__AUDIO__*/', () => src('audio.js'))
  .replace('/*__FX__*/', () => src('fx.js'))
  .replace('/*__GAME__*/', () => src('game.js'));
fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'docs', 'index.html'), html);
for (const f of ['sql-wasm.js', 'sql-wasm.wasm', 'sql-asm.js']) {
  fs.copyFileSync(path.join(__dirname, 'node_modules/sql.js/dist', f), path.join(__dirname, 'docs', f));
}
console.log('built', (html.length / 1024).toFixed(1) + 'KB');
