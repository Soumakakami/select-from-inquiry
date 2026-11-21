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
      name: 'Kさん', role: '先輩エンジニア',
      pal: { h: '#262a33', g: '#9fd0ff', c: '#4a5568' },
      px: ['...hhhhhh...', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssssh.', '.hsgggsgggsh', '.hsgegsgegsh', '.hssssssssh.', '..sssmmsss..', '...ssssss...', '..cccsscccc.', '.cccccccccc.', 'cccccccccccc'],
    },
    cs: {
      name: 'Uさん', role: 'CSチーム',
      pal: { h: '#8a5232', p: '#c0c8d4', c: '#e07a5f' },
      px: ['..hhhhhhhh..', '.hhhhhhhhhh.', 'phhhhhhhhhhp', 'phhsssssshhp', 'phsesssseshp', 'phsssssssshp', 'phssmmmmsshp', '.hhssssssshh', '.hh..pp..hh.', '...cccccc...', '..cccwwccc..', '.cccccccccc.'],
    },
    infra: {
      name: 'Hさん', role: 'インフラ担当',
      pal: { r: '#2f7d5b', h: '#3a3026', d: '#5a4030', c: '#556070' },
      px: ['...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrrr', '..hssssssh..', '..sesssses..', '..ssssssss..', '..sssmmsss..', '..dddddddd..', '...dddddd...', '...cccccc...', '.cccccccccc.', 'cccccccccccc'],
    },
    hacker: {
      name: '影狼', role: 'U-90417',
      pal: { h: '#3a3f5c', k: '#141625', r: '#e43b44', m: '#2a2d40' },
      px: ['..hhhhhhhh..', '.hhhhhhhhhh.', 'hhhhhhhhhhhh', 'hhkkkkkkkkhh', 'hhkrkkkkrkhh', 'hhkkkkkkkkhh', 'hhkkkmmkkkhh', '.hhkkkkkkhh.', '.hhhkkkkhhh.', '..hhhhhhhh..', '.hhhhhhhhhh.', 'hhhhhhhhhhhh'],
    },
    shop: {
      name: 'おばちゃん', role: '購買部',
      pal: { h: '#b9b4c4', g: '#7a7488', a: '#f6757a', c: '#5b8fd6' },
      px: ['....hhhh....', '...hhhhhh...', '..hhhhhhhh..', '.hhsssssshh.', '.hsesssseshg', '.hssssssssh.', '.hssmmmmssh.', '..ssssssss..', '...ssssss...', '..caaaaaac..', '.ccawwwwacc.', 'cccawwwwaccc'],
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
    const colors = opts.colors || (opts.fire ? ['#e43b44', '#f7a823', '#fee761', '#f77622'] : opts.smoke ? ['#8b8fa8', '#5d6182', '#c3c8e8'] : ['#f7a823', '#63c74d', '#f4f1e4', '#e43b44', '#2ce8f5', '#fee761']);
    const n = opts.count || 36;
    const rising = opts.fire || opts.smoke;
    const layer = $('#fx-layer');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'particle';
      const size = Math.random() < 0.6 ? 4 : 8; // ドットに合わせて 4px 単位の正方形
      p.style.cssText = `left:${Math.round(x)}px;top:${Math.round(y)}px;width:${size}px;height:${size}px;background:${colors[i % colors.length]}`;
      layer.appendChild(p);
      const ang = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 220;
      const dx = rising ? (Math.random() - 0.5) * (opts.spread || 160) : Math.cos(ang) * sp;
      const dy = rising ? -(80 + Math.random() * 260) : Math.sin(ang) * sp - 120;
      const fall = rising ? 0 : 260;
      const rot = rising ? 0 : (Math.random() - 0.5) * 900;
      const a = p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.6}px)) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + fall}px)) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: (rising ? 1200 : 900) + Math.random() * 600, delay: rising ? Math.random() * (opts.duration || 300) : 0, easing: rising ? 'steps(8, end)' : 'cubic-bezier(.2,.7,.4,1)', fill: 'both' });
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

  // ------------------------------------------------------------ ドットのアイコン（8×8）
  const ICON_PAL = { k: '#1c1f33', w: '#fbf7ea', y: '#fee761', o: '#f7a823', r: '#e43b44', c: '#2ce8f5', g: '#63c74d', b: '#8890cf' };
  const ICONS = {
    clock: ['..kkkk..', '.kwwwwk.', 'kwwkwwwk', 'kwwkwwwk', 'kwwkkkwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
    coin: ['..kkkk..', '.kyyyyk.', 'kyywyyyk', 'kyywyyok', 'kyywyyok', 'kyyyyook', '.kyoook.', '..kkkk..'],
    paper: ['kkkkkk..', 'kwwwwkk.', 'kwkkwwwk', 'kwwwwwwk', 'kwkkkkwk', 'kwwwrrwk', 'kwwwrrwk', 'kkkkkkkk'],
    flame: ['...r....', '..rr..r.', '..rrr.r.', '.rroorr.', '.rooyor.', 'rroyyorr', '.royyor.', '..rrrr..'],
    search: ['.kkkk...', 'kcwcck..', 'kwccck..', 'kcccck..', '.kkkko..', '.....oo.', '......oo', '.......o'],
    ticket: ['........', 'kkkkkkkk', 'kwwwwwwk', 'kwkkkkwk', 'kwwwwwwk', 'kwkkwwwk', 'kkkkkkkk', '........'],
    wallet: ['........', '.kkkkkk.', 'kooooook', 'koyyyyok', 'koyykkkk', 'koyykyyk', 'koyykkkk', 'kkkkkkk.'],
    shop: ['..kkkk..', '.k....k.', 'kkkkkkkk', 'kooooook', 'kowwwwok', 'kowkkwok', 'kooooook', 'kkkkkkkk'],
  };
  // 大きめのスプライト（ハンマー 16×16、丸めた紙 8×8、ゴミ箱 12×12）
  const SPRITES = {
    hammer: { pal: { k: '#1c1f33', g: '#9aa3b8', w: '#e8ecf5', d: '#5d6578', b: '#9c5a2c' },
      px: ['................', '..kkkkkkkkkkkk..', '..kwwgggggggdk..', '..kwggggggggdk..', '..kgggggggggdk..', '..kddddddddddk..', '..kkkkkkkkkkkk..',
        '......kbbk......', '......kbbk......', '......kbbk......', '......kbbk......', '......kbbk......', '......kbbk......', '......kbbk......', '......kbbk......', '......kkkk......'] },
    ball: { pal: { k: '#1c1f33', w: '#fbf7ea', p: '#d8d0b8', r: '#e43b44' },
      px: ['..kkkk..', '.kwwpwk.', 'kwpwwrwk', 'kwwwpwpk', 'kpwrwwwk', 'kwwpwwwk', '.kwwwpk.', '..kkkk..'] },
    bin: { pal: { k: '#1c1f33', g: '#9aa3b8', d: '#6b7388' },
      px: ['..kkkkkkkk..', '.kggggggggk.', 'kkkkkkkkkkkk', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '.kgdgdgdgdk.', '..kkkkkkkk..'] },
  };
  function sprite(name, scale) {
    const sp = SPRITES[name]; if (!sp) return '';
    const s = scale || 4, w = sp.px[0].length, h = sp.px.length;
    let rects = '';
    sp.px.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = sp.pal[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
    return `<svg width="${w * s}" height="${h * s}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  // ------------------------------------------------------------ 証拠のログを叩きつける
  function evidence(cardHtml) {
    const el = document.createElement('div');
    el.className = 'evidence';
    el.innerHTML = `<div class="evidence-card">${cardHtml}</div><p class="evidence-shout">ログは嘘をつかない！</p>`;
    $('#fx-layer').appendChild(el);
    snd('whoosh');
    setTimeout(() => { snd('smash'); shake($('.app'), true); flash('white'); }, reduced() ? 0 : 260);
    setTimeout(() => el.remove(), reduced() ? 900 : 1500);
  }

  // ------------------------------------------------------------ 禁断のDROP（夢オチ）
  function dropSequence(sqlText, table, done) {
    const el = document.createElement('div');
    el.className = 'dropseq';
    el.innerHTML = '<pre class="dropseq-term"></pre><div class="dropseq-dream" hidden><p class="dream-main">……という夢を見た。</p><p class="dream-sub">※現実の本番DBでは、絶対にやめましょう。</p></div>';
    document.body.appendChild(el);
    const term = $('.dropseq-term', el), dream = $('.dropseq-dream', el);
    const desk = $('.desk');
    const lines = [
      `prod-replica-01> ${sqlText.replace(/\s+/g, ' ').trim()}`,
      `OK. テーブル ${table} を削除しました。(0.01 sec)`,
      '',
      `[ALERT] GameAPI: no such table: ${table}`,
      '[ALERT] ログイン成功率 99.8% → 0.0%',
      '[ALERT] 同時接続 52,391 → 0',
    ];
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, reduced() ? Math.min(ms, 300) : ms));
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      timers.forEach(clearTimeout);
      desk.classList.remove('crumble');
      el.classList.add('is-out');
      setTimeout(() => { el.remove(); done(); }, 400);
    };
    lines.forEach((l, i) => at(250 + i * 260, () => { term.textContent += (i ? '\n' : '') + l; snd(i < 2 ? 'type' : 'warn'); }));
    at(2000, () => {
      el.classList.add('is-burning');
      desk.classList.add('crumble');
      snd('explode'); siren(); flash('red');
      const r = desk.getBoundingClientRect();
      for (let k = 0; k < 5; k++) setTimeout(() => burst(r.left + r.width * (0.1 + k * 0.2), r.bottom - 10, { fire: true, count: 26, spread: 120, duration: 600 }), k * 120);
      say('infra', 'うわあああああ！！！ 本番のテーブルが消えた！！！ バックアップ！ バックアップどこ！？', { interrupt: true, hold: 2200 });
      say('bucho', '…………（気絶）', { hold: 1600 });
    });
    at(5400, () => { term.hidden = true; dream.hidden = false; el.classList.add('is-dream'); desk.classList.remove('crumble'); });
    at(8200, finish);
    el.addEventListener('click', () => { if (!dream.hidden) finish(); else { timers.forEach(clearTimeout); term.hidden = true; dream.hidden = false; el.classList.add('is-dream'); desk.classList.remove('crumble'); timers.push(setTimeout(finish, 1800)); } });
  }

  // ------------------------------------------------------------ 始末書を丸めてゴミ箱へ
  function trashThrow(onResult) {
    if ($('.trash-game')) return;
    const el = document.createElement('div');
    el.className = 'trash-game';
    el.innerHTML = `<p class="trash-tip">始末書を丸めた！　ゴミ箱が来たらクリックで投げろ</p>
      <div class="trash-lane"><div class="trash-bin">${sprite('bin', 4)}</div></div>
      <button class="trash-ball" type="button" aria-label="丸めた始末書を投げる">${sprite('ball', 4)}</button>`;
    document.body.appendChild(el);
    snd('crumple');
    const ball = $('.trash-ball', el), bin = $('.trash-bin', el), lane = $('.trash-lane', el);
    let done = false;
    const end = (hit) => {
      if (done) return; done = true;
      setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); onResult(hit); }, hit == null ? 0 : 700);
    };
    const timeout = setTimeout(() => end(null), 7000);
    ball.addEventListener('click', () => {
      if (done) return;
      clearTimeout(timeout);
      const lr = lane.getBoundingClientRect(), br = bin.getBoundingClientRect(), bl = ball.getBoundingClientRect();
      const target = lr.left + lr.width / 2; // ボールは常にレーンの真ん中へ飛ぶ
      const binCenter = br.left + br.width / 2;
      const hit = Math.abs(binCenter - target) < 30;
      bin.style.animationPlayState = 'paused';
      snd('toss');
      const dx = target - (bl.left + bl.width / 2), dy = (br.top + 8) - (bl.top + bl.height / 2);
      ball.animate([
        { transform: 'translate(0,0) rotate(0)' },
        { transform: `translate(${dx * 0.5}px, ${dy - 90}px) rotate(180deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${hit ? dy : dy + 30}px) rotate(360deg)` },
      ], { duration: 520, easing: 'steps(10, end)', fill: 'forwards' });
      setTimeout(() => { snd(hit ? 'clang' : 'plop'); if (hit) burstFrom(bin, { count: 12 }); el.classList.add(hit ? 'is-hit' : 'is-miss'); }, 520);
      end(hit);
    });
  }

  // ------------------------------------------------------------ BANハンマー
  function banHammer(done) {
    const el = document.createElement('div');
    el.className = 'ban';
    el.innerHTML = `<div class="ban-card">${avatar('hacker')}<div><b>影狼</b><span>U-90417</span><em class="ban-status">ACTIVE</em></div></div>
      <div class="ban-hammer">${sprite('hammer', 8)}</div><p class="ban-shout">BANNED!!</p>`;
    document.body.appendChild(el);
    const card = $('.ban-card', el);
    setTimeout(() => {
      snd('hammer'); shake($('.app'), true); flash('white');
      el.classList.add('is-hit');
      $('.ban-status', el).textContent = 'BANNED';
      burstFrom(card, { count: 40 });
    }, reduced() ? 100 : 700);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => { el.remove(); done && done(); }, 300); }, reduced() ? 1200 : 2600);
  }
  function icon(name, scale) {
    const px = ICONS[name]; if (!px) return '';
    const s = scale || 3;
    let rects = '';
    px.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = ICON_PAL[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
    return `<svg width="${8 * s}" height="${8 * s}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  // ------------------------------------------------------------ タイトル背景：夕暮れの街（ドット絵）
  function skyline() {
    const W = 320, H = 180;
    let seed = 4242;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    let s = '', defs = '';
    const rect = (x, y, w, h, c, extra) => { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra || ''}/>`; };
    // 空：色の帯と、帯のつなぎ目の市松ディザ
    const sky = ['#2a2560', '#3a2d74', '#523a88', '#714795', '#965596', '#bd6690', '#e27d84', '#f59c78', '#fbbd7a'];
    const bh = 13;
    sky.forEach((c, i) => {
      rect(0, i * bh, W, bh, c);
      if (i < sky.length - 1) {
        defs += `<pattern id="d${i}" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${sky[i + 1]}"/><rect x="1" y="1" width="1" height="1" fill="${sky[i + 1]}"/></pattern>`;
        rect(0, (i + 1) * bh - 3, W, 3, `url(#d${i})`);
      }
    });
    rect(0, sky.length * bh, W, H - sky.length * bh, sky[sky.length - 1]);
    // 星
    for (let i = 0; i < 46; i++) {
      const tw = rnd() < 0.35 ? ` class="tw" style="animation-delay:${(rnd() * 3).toFixed(1)}s"` : '';
      rect(ri(0, W - 1), ri(2, 52), 1, 1, rnd() < 0.3 ? '#fee761' : '#fbf7ea', tw);
    }
    // 月
    const mx = 258, my = 26, mr = 9;
    for (let dy = -mr; dy <= mr; dy++) { const hw = Math.floor(Math.sqrt(mr * mr - dy * dy)); rect(mx - hw, my + dy, hw * 2 + 1, 1, '#fff1c1'); }
    rect(mx - 3, my - 2, 2, 2, '#f1dca0'); rect(mx + 2, my + 3, 3, 2, '#f1dca0'); rect(mx + 4, my - 5, 1, 1, '#f1dca0');
    // 雲
    [[30, 40, 34], [196, 58, 44], [96, 70, 30]].forEach(([x, y, w]) => { rect(x, y, w, 2, '#f7b2a0'); rect(x + 4, y - 2, w - 10, 2, '#f7b2a0'); rect(x + 2, y + 2, w - 2, 1, '#d98a94'); });
    // ビル（奥 → 手前）。窓の明かりはランダム、一部はまたたく
    const layer = (color, hMin, hMax, wMin, wMax, lit, winColor) => {
      let x = -ri(0, 10);
      while (x < W) {
        const w = ri(wMin, wMax), h = ri(hMin, hMax), top = H - h;
        rect(x, top, w, h, color);
        if (rnd() < 0.3) rect(x + Math.floor(w / 2), top - ri(3, 8), 1, 8, color); // アンテナ
        if (lit) {
          for (let wy = top + 4; wy < H - 8; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 4) {
            if (rnd() < lit) {
              const tw = rnd() < 0.06 ? ` class="tw" style="animation-delay:${(rnd() * 4).toFixed(1)}s"` : '';
              rect(wx, wy, 2, 2, rnd() < 0.8 ? winColor : '#fbf7ea', tw);
            }
          }
        }
        x += w + ri(0, 3);
      }
    };
    layer('#7a4f8a', 46, 88, 14, 28, 0, null);
    layer('#4e3672', 36, 70, 16, 30, 0.22, '#ffd27a');
    // 会社のビル（中央・いちばん高い）
    const ox = 138, ow = 46, oh = 132, ot = H - oh;
    rect(ox, ot, ow, oh, '#2f2350'); rect(ox + 2, ot - 4, ow - 4, 4, '#2f2350');
    rect(ox + ow / 2, ot - 18, 1, 14, '#2f2350'); rect(ox + ow / 2 - 1, ot - 20, 3, 3, '#e43b44', ' class="tw"');
    rect(ox + 6, ot + 6, ow - 12, 8, '#f7a823'); rect(ox + 8, ot + 8, ow - 16, 4, '#ffd166'); // 看板
    for (let wy = ot + 20; wy < H - 10; wy += 6) for (let wx = ox + 4; wx < ox + ow - 4; wx += 5) {
      const on = rnd() < 0.55 || (wy > H - 60 && wx > ox + 18 && wx < ox + 30);
      if (on) rect(wx, wy, 3, 3, rnd() < 0.85 ? '#ffe28a' : '#9fe8ff');
    }
    layer('#1f1838', 22, 46, 18, 34, 0.3, '#ffc65a');
    rect(0, H - 4, W, 4, '#151027');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
  }

  root.FX = { avatar, icon, sprite, skyline, evidence, dropSequence, trashThrow, banHammer, say, closeSay: () => { queue.length = 0; close(true); }, cutin, flash, shake, siren, burst, burstFrom, floatText, countUp, boot, reduced, PEOPLE };
})(window);
