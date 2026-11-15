/*
 * ログは嘘をつかない — 演出（キャラクターの会話、カットイン、パーティクル、起動画面など）
 * 画像ファイルは使わず、ドット絵は文字列から SVG を組み立てる。
 * prefers-reduced-motion のときは動きを抑える。
 */
(function (root) {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const snd = (n) => { if (root.Sound) root.Sound.sfx(n); };

  // ------------------------------------------------------------ ドット絵の登場人物（12×12）
  const BASE_PAL = { k: '#1b2330', s: '#f1c8a0', e: '#1b2330', m: '#b0504a', w: '#eef1f4' };
  const PEOPLE = {
    senpai: {
      name: '黒田', role: '先輩エンジニア',
      pal: { h: '#262a33', g: '#9fd0ff', c: '#4a5568' },
      px: ['...hhhhhh...', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssssh.', '.hsgggsgggsh', '.hsgegsgegsh', '.hssssssssh.', '..sssmmsss..', '...ssssss...', '..cccsscccc.', '.cccccccccc.', 'cccccccccccc'],
    },
    cs: {
      name: '佐倉', role: 'CSチーム',
      pal: { h: '#8a5232', p: '#c0c8d4', c: '#e07a5f' },
      px: ['..hhhhhhhh..', '.hhhhhhhhhh.', 'phhhhhhhhhhp', 'phhsssssshhp', 'phsesssseshp', 'phsssssssshp', 'phssmmmmsshp', '.hhssssssshh', '.hh..pp..hh.', '...cccccc...', '..cccwwccc..', '.cccccccccc.'],
    },
    infra: {
      name: '大森', role: 'インフラ担当',
      pal: { r: '#2f7d5b', h: '#3a3026', d: '#5a4030', c: '#556070' },
      px: ['...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrrr', '..hssssssh..', '..sesssses..', '..ssssssss..', '..sssmmsss..', '..dddddddd..', '...dddddd...', '...cccccc...', '.cccccccccc.', 'cccccccccccc'],
    },
    bucho: {
      name: '部長', role: '運用部',
      pal: { h: '#7a7a7a', d: '#3b3b3b', n: '#2b3240', t: '#d4361f' },
      px: ['............', '...ssssss...', '..ssssssss..', '.hssssssssh.', '.hskksskksh.', '.hsessssesh.', '.hssssssssh.', '..dddddddd..', '...smmmms...', '...nnwwnn...', '.nnnnttnnnn.', 'nnnnnttnnnnn'],
    },
  };
  function avatar(who) {
    const p = PEOPLE[who]; if (!p) return '';
    const pal = Object.assign({}, BASE_PAL, p.pal);
    let rects = '';
    p.px.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`; } });
    return `<svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  // ------------------------------------------------------------ 会話ウィンドウ
  const queue = [];
  let showing = null, typeTimer = null, hideTimer = null;
  function say(who, html, opts) {
    opts = opts || {};
    const msg = { who, html, hold: opts.hold };
    if (opts.interrupt) { queue.length = 0; close(true); }
    queue.push(msg);
    if (!showing) next();
  }
  function next() {
    const msg = queue.shift();
    if (!msg) { showing = null; return; }
    showing = msg;
    const p = PEOPLE[msg.who] || PEOPLE.senpai;
    const box = $('#comm');
    box.innerHTML = `<div class="comm comm-${msg.who}" role="status">
      <div class="comm-face">${avatar(msg.who)}</div>
      <div class="comm-body"><div class="comm-name">${esc(p.name)}<small>${esc(p.role)}</small></div><p class="comm-text"></p></div>
      <button class="comm-close" type="button" aria-label="閉じる">▼</button></div>`;
    const el = $('.comm', box), text = $('.comm-text', box);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const plain = msg.html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const done = () => { clearInterval(typeTimer); typeTimer = null; text.innerHTML = msg.html; el.classList.add('is-done'); armHide(plain.length); };
    if (reduced()) { done(); return; }
    let i = 0;
    typeTimer = setInterval(() => {
      i += 2;
      text.textContent = plain.slice(0, i);
      if (i % 6 === 0) snd('type');
      if (i >= plain.length) done();
    }, 22);
    el.addEventListener('click', () => { if (typeTimer) done(); else close(); });
    el.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    el.addEventListener('mouseleave', () => { if (!typeTimer) armHide(10); });
  }
  function armHide(len) {
    clearTimeout(hideTimer);
    const ms = showing && showing.hold ? showing.hold : Math.min(9000, 2600 + len * 55);
    hideTimer = setTimeout(close, ms);
  }
  function close(silent) {
    clearInterval(typeTimer); typeTimer = null; clearTimeout(hideTimer);
    const el = $('#comm .comm');
    if (el) { el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => { if (el.parentNode) el.remove(); }, 220); }
    showing = null;
    if (!silent) setTimeout(() => { if (!showing) next(); }, 240);
  }

  // ------------------------------------------------------------ カットイン
  function cutin(kind, main, sub) {
    const layer = $('#fx-layer');
    const el = document.createElement('div');
    el.className = `cutin is-${kind}`;
    el.innerHTML = `<div class="cutin-band"><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
    layer.appendChild(el);
    snd('whoosh');
    setTimeout(() => el.remove(), reduced() ? 900 : 1700);
  }

  // ------------------------------------------------------------ 画面効果
  function flash(kind) {
    const layer = $('#fx-layer');
    const el = document.createElement('div');
    el.className = `flash is-${kind}`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }
  function shake(el, hard) {
    if (!el || reduced()) return;
    const cls = hard ? 'shake-hard' : 'shake';
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 500);
  }
  function siren() {
    const layer = $('#fx-layer');
    const el = document.createElement('div');
    el.className = 'siren';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
  function burst(x, y, opts) {
    if (reduced()) return;
    opts = opts || {};
    const colors = opts.colors || ['#efa63a', '#3fb67f', '#eef1f4', '#d4361f', '#8db7ff'];
    const n = opts.count || 36;
    const layer = $('#fx-layer');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'particle';
      const size = 4 + Math.random() * 6;
      p.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.5)}px;background:${colors[i % colors.length]}`;
      layer.appendChild(p);
      const ang = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 220;
      const dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp - 120;
      const rot = (Math.random() - 0.5) * 900;
      const a = p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.6}px)) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 260}px)) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      a.onfinish = () => p.remove();
    }
  }
  function burstFrom(el, opts) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }
  function floatText(el, text, kind) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = `float-text is-${kind || 'plus'}`;
    f.textContent = text;
    f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top + r.height}px`;
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
  function countUp(el, from, to, ms) {
    if (!el) return;
    if (reduced() || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = ms || 700;
    let lastTick = 0;
    el.classList.add('is-counting');
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = v;
      if (now - lastTick > 60 && k < 1) { snd('tick'); lastTick = now; }
      if (k < 1) requestAnimationFrame(step); else el.classList.remove('is-counting');
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ 起動ログ
  function boot(lines, done) {
    const el = document.createElement('div');
    el.className = 'boot';
    el.innerHTML = '<pre class="boot-text"></pre><p class="boot-skip">クリックでスキップ</p>';
    document.body.appendChild(el);
    const pre = $('.boot-text', el);
    let li = 0, ci = 0, timer = null, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      clearTimeout(timer);
      pre.textContent = lines.join('\n');
      el.classList.add('is-out');
      setTimeout(() => { el.remove(); done(); }, 380);
    };
    el.addEventListener('click', finish);
    if (reduced()) { setTimeout(finish, 300); return; }
    const tick = () => {
      if (li >= lines.length) { timer = setTimeout(finish, 650); return; }
      const line = lines[li];
      ci = Math.min(line.length, ci + (line.startsWith('>') ? 2 : 6));
      pre.textContent = lines.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ci) + '█';
      if (ci >= line.length) { li++; ci = 0; snd(line.includes('OK') ? 'boot' : 'type'); timer = setTimeout(tick, 170); }
      else timer = setTimeout(tick, 16);
    };
    tick();
  }

  // ------------------------------------------------------------ タイトル背景のログ
  function logRain(n) {
    const svc = ['GameAPI', 'AuthService', 'ItemService', 'GemGrantService', 'MySQL', 'Redis', 'Batch', 'ChatService'];
    const act = ['LOGIN SUCCESS', 'ENHANCE_SUCCESS', 'TRADE_OUT', 'GUILD_DONATE', 'PURCHASE', 'STORAGE_IN', 'DELETE', 'WORLD_TRANSFER', 'LOGIN FAILED', 'GACHA'];
    const lv = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR'];
    let s = '';
    for (let i = 0; i < n; i++) {
      const h = String(Math.floor(Math.random() * 24)).padStart(2, '0'), m = String(Math.floor(Math.random() * 60)).padStart(2, '0'), sec = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const l = lv[Math.floor(Math.random() * lv.length)];
      s += `<span class="lv-${l.toLowerCase()}">2026-11-12 ${h}:${m}:${sec} ${l.padEnd(5)} ${svc[i % svc.length]} user=${10000 + Math.floor(Math.random() * 89999)} ${act[Math.floor(Math.random() * act.length)]}</span>\n`;
    }
    return s;
  }

  root.FX = { avatar, say, closeSay: () => { queue.length = 0; close(true); }, cutin, flash, shake, siren, burst, burstFrom, floatText, countUp, boot, logRain, reduced, PEOPLE };
})(window);
