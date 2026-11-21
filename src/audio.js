/*
 * ログは嘘をつかない — サウンド（BGM・効果音）
 * 音声ファイルは使わず、Web Audio API でその場で合成する（ダウンロード不要・ライセンス不要）。
 * ブラウザの自動再生制限があるため、最初のクリック／キー入力で AudioContext を作る。
 * 設定（BGM・効果音のオン/オフ）は localStorage に保存。使えない環境でも動く。
 */
(function (root) {
  'use strict';

  const PREF_KEY = 'logs-dont-lie:audio';
  const BGM_LEVEL = 0.32; // BGM の音量（効果音より控えめに）
  const MASTER = 0.8;

  const prefs = (() => {
    const d = { bgm: true, sfx: true };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return d; }
  })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } };

  let ctx = null, master = null, bgmBus = null, sfxBus = null, noiseBuf = null;
  let bgmWanted = false;
  const listeners = [];

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = MASTER;
      master.connect(comp); comp.connect(ctx.destination);
      bgmBus = ctx.createGain(); bgmBus.gain.value = prefs.bgm ? BGM_LEVEL : 0; bgmBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return ctx;
  }
  const ready = () => ctx && ctx.state === 'running';

  // ------------------------------------------------------------ 音の部品
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(o) {
    const { t, f, dur, bus = sfxBus } = o;
    const type = o.type || 'sine', peak = o.gain == null ? 0.2 : o.gain, attack = o.attack || 0.004;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (o.hold) g.gain.setValueAtTime(peak, t + attack + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + (o.hold || 0) + dur);
    let node = osc;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || 0.7; node.connect(fl); node = fl; }
    node.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + attack + (o.hold || 0) + dur + 0.05);
  }

  function noise(o) {
    const { t, dur, bus = sfxBus } = o;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = o.filter || 'bandpass';
    fl.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freq2) fl.frequency.exponentialRampToValueAtTime(o.freq2, t + dur);
    fl.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain == null ? 0.2 : o.gain, t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  // エレピ風の短い音（サイン波＋倍音）
  function pluck(t, midi, len, gain, bus) {
    const f = mtof(midi);
    tone({ t, f, dur: Math.max(0.25, len), gain, bus, attack: 0.006 });
    tone({ t, f: f * 2, dur: 0.18, gain: gain * 0.35, bus, attack: 0.003 });
    tone({ t, f: f * 3.01, dur: 0.06, gain: gain * 0.12, bus, attack: 0.002 });
  }
  // ベル（正解や開始のチャイム）
  function bell(t, midi, gain, dur) {
    const f = mtof(midi);
    tone({ t, f, dur: dur || 0.9, gain, attack: 0.003 });
    tone({ t, f: f * 2.76, dur: (dur || 0.9) * 0.35, gain: gain * 0.25, attack: 0.002 });
    tone({ t, f: f * 5.4, dur: 0.12, gain: gain * 0.08, attack: 0.001 });
  }
  // 印鑑を押す「ドン」
  function thud(t, gain) {
    tone({ t, f: 140, f2: 48, glide: 0.12, dur: 0.22, gain: gain || 0.55, attack: 0.002 });
    noise({ t, dur: 0.09, gain: 0.25, filter: 'lowpass', freq: 900, q: 0.5 });
    noise({ t: t + 0.004, dur: 0.03, gain: 0.12, filter: 'bandpass', freq: 2400, q: 1.2 });
  }

  // ------------------------------------------------------------ 効果音
  const SFX = {
    // SQL実行：エンターキーの「カタッ」＋短い電子音
    run(t) { noise({ t, dur: 0.035, gain: 0.18, freq: 2600, q: 1.4 }); tone({ t: t + 0.03, f: 880, f2: 1320, glide: 0.05, dur: 0.07, gain: 0.07, type: 'triangle' }); },
    // 結果が返ってきた
    ok(t) { tone({ t: t + 0.09, f: 1318.5, dur: 0.08, gain: 0.05, type: 'triangle' }); tone({ t: t + 0.15, f: 1760, dur: 0.1, gain: 0.04, type: 'triangle' }); },
    // SQLエラー
    error(t) { tone({ t: t + 0.06, f: 233, dur: 0.09, gain: 0.08, type: 'square', lp: 1400 }); tone({ t: t + 0.17, f: 196, dur: 0.14, gain: 0.08, type: 'square', lp: 1200 }); },
    // 正解：解決の印鑑＋チャイム
    solved(t) {
      thud(t);
      [72, 76, 79, 84].forEach((m, i) => bell(t + 0.16 + i * 0.085, m, 0.13, 0.9));
      bell(t + 0.5, 88, 0.06, 1.4);
    },
    // 差し戻し：印鑑＋ブブー
    reject(t) {
      thud(t, 0.45);
      tone({ t: t + 0.14, f: 155, dur: 0.12, hold: 0.05, gain: 0.12, type: 'square', lp: 900 });
      tone({ t: t + 0.36, f: 131, dur: 0.22, hold: 0.08, gain: 0.12, type: 'square', lp: 800 });
    },
    // ヒント：ポロン
    hint(t) { bell(t, 79, 0.1, 0.6); bell(t + 0.1, 86, 0.08, 0.8); },
    // 始末書：警報
    shimatsu(t) {
      for (let i = 0; i < 3; i++) {
        tone({ t: t + i * 0.26, f: 880, f2: 620, glide: 0.22, dur: 0.06, hold: 0.16, gain: 0.07, type: 'square', lp: 2600 });
      }
      thud(t + 0.8, 0.4);
    },
    // インフラ担当からの警告など
    warn(t) { tone({ t, f: 1046.5, dur: 0.1, gain: 0.07, type: 'triangle' }); tone({ t: t + 0.13, f: 784, dur: 0.16, gain: 0.07, type: 'triangle' }); },
    // 小さな通知（根拠欄に入力、コピー など）
    pop(t) { tone({ t, f: 1200, f2: 1600, glide: 0.03, dur: 0.05, gain: 0.07, type: 'sine' }); },
    // チケットを切り替える：紙をめくる
    page(t) { noise({ t, dur: 0.12, gain: 0.1, filter: 'bandpass', freq: 1800, freq2: 5200, q: 0.6, attack: 0.03 }); },
    // 出社：起動チャイム
    start(t) { [60, 64, 67, 72].forEach((m, i) => pluck(t + i * 0.09, m, 0.5, 0.11, sfxBus)); bell(t + 0.38, 79, 0.07, 1.2); },
    // 先輩に聞く
    giveup(t) { [76, 72, 69].forEach((m, i) => pluck(t + i * 0.12, m, 0.4, 0.09, sfxBus)); },
    // チケット着信：電話のベル
    ring(t) {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 6; i++) {
          const tt = t + k * 0.42 + i * 0.045;
          tone({ t: tt, f: i % 2 ? 1568 : 1319, dur: 0.035, gain: 0.05, type: 'square', lp: 3200 });
        }
      }
    },
    // チケットの印字（プリンター）
    print(t) { for (let i = 0; i < 5; i++) noise({ t: t + i * 0.07, dur: 0.05, gain: 0.05, filter: 'bandpass', freq: 900 + i * 120, q: 2.5 }); },
    // 会話の文字送り
    type(t) { tone({ t, f: 520 + Math.random() * 120, dur: 0.025, gain: 0.025, type: 'square', lp: 1800 }); },
    // コンボ
    combo(t) { [76, 81, 86, 88].forEach((m, i) => tone({ t: t + i * 0.05, f: mtof(m), dur: 0.12, gain: 0.07, type: 'square', lp: 4000 })); },
    // スコアのカウントアップ
    tick(t) { tone({ t, f: 1900, dur: 0.02, gain: 0.02, type: 'square', lp: 5000 }); },
    // カットインの「シュッ」
    whoosh(t) { noise({ t, dur: 0.32, gain: 0.12, filter: 'bandpass', freq: 400, freq2: 4200, q: 0.9, attack: 0.08 }); },
    // 起動ログ
    boot(t) { [0, 0.08, 0.16].forEach((d, i) => tone({ t: t + d, f: 660 * (1 + i * 0.5), dur: 0.05, gain: 0.05, type: 'square', lp: 3000 })); },
    // 結果画面の1行（小さな印鑑）
    reveal(t) { thud(t, 0.25); },
    // 称号の発表
    rank(t) { thud(t, 0.6); [72, 79, 84, 88, 91].forEach((m, i) => bell(t + 0.12 + i * 0.07, m, 0.1, 1.2)); },
    // 証拠を叩きつける「バンッ」
    smash(t) { thud(t, 0.75); noise({ t, dur: 0.18, gain: 0.3, filter: 'lowpass', freq: 1800, q: 0.6 }); tone({ t, f: 90, f2: 40, glide: 0.2, dur: 0.3, gain: 0.4, type: 'triangle' }); },
    // 紙を丸める
    crumple(t) { for (let i = 0; i < 7; i++) noise({ t: t + i * 0.045 + Math.random() * 0.02, dur: 0.04, gain: 0.08, filter: 'bandpass', freq: 2500 + Math.random() * 2500, q: 1.5 }); },
    // 投げる
    toss(t) { noise({ t, dur: 0.25, gain: 0.08, filter: 'bandpass', freq: 600, freq2: 2400, q: 1, attack: 0.05 }); },
    // ゴミ箱に入った「カコーン」
    clang(t) { tone({ t, f: 1240, dur: 0.4, gain: 0.08, type: 'square', lp: 3000 }); tone({ t, f: 1870, dur: 0.3, gain: 0.05, type: 'triangle' }); thud(t, 0.2); },
    // 外れた「ポテッ」
    plop(t) { tone({ t, f: 220, f2: 110, glide: 0.1, dur: 0.12, gain: 0.12, type: 'triangle' }); },
    // 爆発・崩壊
    explode(t) { noise({ t, dur: 1.4, gain: 0.45, filter: 'lowpass', freq: 2400, freq2: 120, q: 0.4 }); tone({ t, f: 70, f2: 28, glide: 1.2, dur: 1.3, gain: 0.5, type: 'sine' }); thud(t, 0.8); },
    // ハンマー
    hammer(t) { thud(t, 0.9); tone({ t, f: 880, dur: 0.25, gain: 0.08, type: 'square', lp: 2500 }); noise({ t, dur: 0.3, gain: 0.3, filter: 'lowpass', freq: 1200 }); },
    // 炎上
    enjo(t) { SFX.shimatsu(t); noise({ t: t + 0.1, dur: 1.2, gain: 0.15, filter: 'bandpass', freq: 800, freq2: 3000, q: 0.5 }); },
    // メカニカルキーボードの実行音「カチャッ」
    runMech(t) {
      noise({ t, dur: 0.03, gain: 0.22, filter: 'bandpass', freq: 3800, q: 2.2 });
      noise({ t: t + 0.035, dur: 0.04, gain: 0.16, filter: 'bandpass', freq: 1900, q: 1.6 });
      tone({ t: t + 0.03, f: 2400, dur: 0.02, gain: 0.04, type: 'square', lp: 6000 });
      tone({ t: t + 0.07, f: 880, f2: 1320, glide: 0.05, dur: 0.07, gain: 0.06, type: 'triangle' });
    },
    // レジの「チーン」
    register(t) {
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.05, dur: 0.04, gain: 0.07, filter: 'bandpass', freq: 1500 + i * 300, q: 3 });
      bell(t + 0.18, 93, 0.12, 1.2); bell(t + 0.18, 100, 0.05, 0.8);
    },
    // 給料：コインがじゃらじゃら
    coins(t) { for (let i = 0; i < 8; i++) { const tt = t + i * 0.06 + Math.random() * 0.02; tone({ t: tt, f: 1900 + Math.random() * 900, dur: 0.07, gain: 0.05, type: 'square', lp: 6000 }); tone({ t: tt, f: 3800 + Math.random() * 600, dur: 0.05, gain: 0.025, type: 'triangle' }); } },
    // 缶を開ける「プシュッ」＋ごくごく
    can(t) {
      noise({ t, dur: 0.035, gain: 0.2, filter: 'bandpass', freq: 2200, q: 2 });
      noise({ t: t + 0.03, dur: 0.35, gain: 0.16, filter: 'highpass', freq: 3500, freq2: 7000, q: 0.5 });
      [0.5, 0.75, 1.0].forEach((d) => tone({ t: t + d, f: 180, f2: 120, glide: 0.1, dur: 0.12, gain: 0.12, type: 'sine' }));
    },
    // 時計が巻き戻る
    rewind(t) { for (let i = 0; i < 6; i++) tone({ t: t + i * 0.05, f: 1600 - i * 150, dur: 0.04, gain: 0.04, type: 'square', lp: 4000 }); },
    // 結果発表：ファンファーレ
    final(t) {
      const seq = [[0, 67], [0.12, 72], [0.24, 76], [0.36, 79], [0.6, 84]];
      seq.forEach(([d, m]) => pluck(t + d, m, 0.5, 0.12, sfxBus));
      [72, 76, 79, 83].forEach((m) => tone({ t: t + 0.6, f: mtof(m), dur: 1.6, hold: 0.3, gain: 0.04, type: 'triangle', attack: 0.05, lp: 2400 }));
      bell(t + 0.62, 96, 0.05, 1.6);
    },
  };

  function sfx(name) {
    if (!prefs.sfx) return;
    if (!ctx || !ensure()) return; // まだ一度も操作されていない（自動再生制限中）なら鳴らさない
    const f = SFX[name]; if (!f) return;
    try { f(ctx.currentTime + 0.01); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ BGM
  // 曲は SONGS に並べる。最初から入っているのは lofi。ほかはゲーム内の購買部で買えるカセット。
  // 4小節のコード進行を8小節のメロディで回す。メロディは [16分の位置, MIDIノート, 長さ(16分)]
  const BAR = 16;
  // 夜の運用デスクの、落ち着いたローファイ（78BPM）
  const LOFI_MELODY = [
    [[0, 76, 4], [6, 72, 2], [8, 74, 2], [12, 72, 4]],
    [[2, 74, 2], [4, 71, 4], [10, 67, 2], [12, 69, 4]],
    [[0, 67, 2], [3, 71, 3], [8, 74, 4], [14, 76, 2]],
    [[0, 76, 6], [8, 72, 2], [10, 71, 2], [12, 69, 4]],
    [[8, 81, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 74, 4], [6, 71, 2], [8, 74, 2], [12, 79, 4]],
    [[0, 76, 3], [4, 74, 2], [8, 71, 4], [12, 67, 4]],
    [[0, 69, 8], [12, 64, 2], [14, 67, 2]],
  ];
  const SONGS = {
    lofi: {
      bpm: 78, lead: 'pluck', drums: 'lofi', swing: 0.2,
      chords: [{ root: 41, notes: [53, 57, 60, 64] }, { root: 43, notes: [55, 59, 62, 64] }, { root: 40, notes: [52, 55, 59, 62] }, { root: 45, notes: [60, 64, 67, 71] }],
      melody: LOFI_MELODY,
      bass: [[0, 0, 6], [7, 0, 2], [10, 7, 4], [14, 12, 2]], // [位置, ルートからの半音, 長さ]
    },
    // カセット「8bit ラン」：速いチップチューン（132BPM）
    chip: {
      bpm: 132, lead: 'square', drums: 'chip', swing: 0,
      chords: [{ root: 48, notes: [60, 64, 67] }, { root: 45, notes: [57, 60, 64] }, { root: 41, notes: [53, 57, 60] }, { root: 43, notes: [55, 59, 62] }],
      melody: [
        [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
        [[0, 72, 2], [2, 76, 2], [4, 81, 4], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
        [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 81, 2], [10, 77, 2], [12, 74, 4]],
        [[0, 74, 2], [2, 79, 2], [4, 83, 4], [8, 86, 4], [12, 83, 4]],
        [[0, 84, 4], [4, 83, 2], [6, 81, 2], [8, 79, 4], [12, 76, 4]],
        [[0, 76, 2], [2, 79, 2], [4, 81, 2], [6, 84, 2], [8, 88, 4], [12, 84, 4]],
        [[0, 81, 2], [2, 79, 2], [4, 77, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
        [[0, 74, 4], [4, 79, 4], [8, 83, 2], [10, 86, 2], [12, 91, 4]],
      ],
      bass: [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 7, 1], [14, 12, 1]],
    },
    // カセット「シティポップ・ナイト」：夜の首都高（100BPM）
    city: {
      bpm: 100, lead: 'pluck', drums: 'city', swing: 0.1,
      chords: [{ root: 38, notes: [53, 57, 60, 64] }, { root: 43, notes: [53, 59, 64, 67] }, { root: 36, notes: [55, 59, 62, 64] }, { root: 45, notes: [55, 61, 64, 67] }],
      melody: [
        [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 4], [12, 69, 2], [14, 72, 2]],
        [[0, 74, 6], [8, 71, 2], [10, 74, 2], [12, 76, 4]],
        [[0, 76, 2], [2, 79, 2], [4, 83, 4], [10, 81, 2], [12, 79, 4]],
        [[0, 76, 4], [6, 73, 2], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
        [[0, 81, 2], [2, 79, 2], [4, 77, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
        [[2, 74, 2], [4, 77, 2], [6, 79, 4], [12, 83, 4]],
        [[0, 84, 4], [4, 83, 2], [6, 79, 2], [8, 76, 4], [12, 79, 4]],
        [[0, 81, 6], [8, 79, 2], [10, 76, 2], [12, 73, 4]],
      ],
      bass: [[0, 0, 3], [3, 12, 1], [6, 0, 2], [8, 7, 2], [11, 10, 2], [14, 12, 2]],
    },
    // カセット「雨の残業」：ドラムなし、雨の音だけ（64BPM）
    rain: {
      bpm: 64, lead: 'bell', drums: 'rain', swing: 0,
      chords: [{ root: 45, notes: [57, 60, 64, 67] }, { root: 41, notes: [53, 57, 60, 64] }, { root: 48, notes: [55, 59, 60, 64] }, { root: 43, notes: [55, 60, 62, 67] }],
      melody: [
        [[0, 76, 8], [12, 72, 4]], [[4, 77, 4], [8, 76, 4]], [[0, 79, 8], [10, 76, 2], [12, 74, 4]], [[0, 74, 12]],
        [[0, 81, 4], [4, 79, 4], [8, 76, 8]], [[2, 77, 2], [4, 76, 4], [12, 72, 4]], [[0, 71, 4], [4, 72, 4], [8, 76, 8]], [[0, 74, 8], [8, 72, 8]],
      ],
      bass: [[0, 0, 12]],
    },
  };
  let song = SONGS.lofi, STEP = 60 / song.bpm / 4;

  let timer = null, nextT = 0, stepAbs = 0;

  function pad(t, chord, len) {
    for (const m of chord.notes) {
      for (const det of [-7, 7]) {
        tone({ t, f: mtof(m), dur: 0.9, hold: len - 0.5, gain: 0.018, type: 'triangle', attack: 0.45, detune: det, lp: 1100, bus: bgmBus });
      }
    }
  }
  function playStep(s, t) {
    const S = song, bar = Math.floor(s / BAR), st = s % BAR;
    const chord = S.chords[bar % S.chords.length];
    const swing = st % 2 === 1 ? STEP * S.swing : 0;
    const tt = t + swing;
    const drums = bar >= 2; // 最初の2小節はパッドとメロディだけ
    if (st === 0) pad(t, chord, BAR * STEP);
    for (const [p, semi, len] of S.bass) {
      if (p !== st) continue;
      if (S.lead === 'square') tone({ t: tt, f: mtof(chord.root + semi), dur: len * STEP * 0.8, gain: 0.07, type: 'triangle', attack: 0.004, bus: bgmBus });
      else tone({ t: tt, f: mtof(chord.root + semi), dur: len * STEP * 0.9, gain: S.lead === 'bell' ? 0.1 : 0.16, type: 'sine', attack: 0.01, bus: bgmBus });
    }
    if (bar >= 1) {
      for (const [p, m, len] of S.melody[bar % S.melody.length]) {
        if (p !== st) continue;
        if (S.lead === 'square') tone({ t: tt, f: mtof(m), dur: len * STEP * 0.85, gain: 0.035, type: 'square', attack: 0.003, lp: 3600, bus: bgmBus });
        else if (S.lead === 'bell') { pluck(tt, m, len * STEP, 0.05, bgmBus); tone({ t: tt, f: mtof(m + 12), dur: 1.2, gain: 0.012, type: 'sine', attack: 0.01, bus: bgmBus }); }
        else pluck(tt, m, len * STEP, 0.07, bgmBus);
      }
    }
    if (S.drums === 'rain') { // 雨音
      noise({ t, dur: STEP * 1.2, gain: 0.012 + Math.random() * 0.01, filter: 'highpass', freq: 5200, q: 0.4, bus: bgmBus });
      if (Math.random() < 0.3) noise({ t: t + Math.random() * STEP, dur: 0.02, gain: 0.02, filter: 'bandpass', freq: 3000 + Math.random() * 3000, q: 4, bus: bgmBus });
      return;
    }
    if (!drums) return;
    const kick = (g) => tone({ t: tt, f: 110, f2: 42, glide: 0.11, dur: 0.24, gain: g, bus: bgmBus });
    const snare = (g) => { noise({ t: tt, dur: 0.11, gain: g, filter: 'bandpass', freq: 1700, q: 0.9, bus: bgmBus }); tone({ t: tt, f: 190, dur: 0.06, gain: g * 0.6, type: 'triangle', bus: bgmBus }); };
    const hat = (g, d) => noise({ t: tt, dur: d, gain: g, filter: 'highpass', freq: 7500, q: 0.7, bus: bgmBus });
    if (S.drums === 'chip') {
      if (st % 8 === 0) tone({ t: tt, f: 160, f2: 50, glide: 0.06, dur: 0.1, gain: 0.25, type: 'square', lp: 900, bus: bgmBus });
      if (st === 4 || st === 12) noise({ t: tt, dur: 0.08, gain: 0.08, filter: 'highpass', freq: 2500, q: 0.5, bus: bgmBus });
      if (st % 2 === 0) hat(0.018, 0.02);
      return;
    }
    if (S.drums === 'city') {
      if (st === 0 || st === 8 || st === 11) kick(0.3);
      if (st === 4 || st === 12) snare(0.08);
      hat(st % 2 ? 0.012 : 0.025, st % 4 === 2 ? 0.06 : 0.025);
      return;
    }
    if (st === 0 || st === 10 || (st === 7 && bar % 2 === 1)) kick(0.32);
    if (st === 4 || st === 12) snare(0.07);
    if (st % 2 === 0) hat(st % 4 === 2 ? 0.035 : 0.02, st % 4 === 2 ? 0.05 : 0.03);
  }
  function scheduler() {
    if (!ready()) return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // 復帰時に溜まった分は飛ばす
    while (nextT < ctx.currentTime + 0.15) {
      playStep(stepAbs, nextT);
      nextT += STEP;
      stepAbs = (stepAbs + 1) % (BAR * song.melody.length * 4) || BAR * song.melody.length; // ループ時はイントロを飛ばし、8小節の頭へ
    }
  }
  function startLoop() {
    if (timer || !prefs.bgm || !bgmWanted || !ensure() || !ready()) return;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmBus.gain.linearRampToValueAtTime(BGM_LEVEL, ctx.currentTime + 1.5);
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(scheduler, 25);
    scheduler();
  }
  function stopLoop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (ctx) { bgmBus.gain.cancelScheduledValues(ctx.currentTime); bgmBus.gain.setTargetAtTime(0, ctx.currentTime, 0.08); }
    stepAbs = 0;
  }

  // ------------------------------------------------------------ 公開API
  function playBgm() { bgmWanted = true; startLoop(); }
  function setBgm(on) { prefs.bgm = !!on; savePrefs(); if (on) { bgmWanted = true; ensure(); startLoop(); } else stopLoop(); notify(); }
  // 曲を替える（カセットの入れ替え）。鳴っていれば頭から流し直す
  function setSong(name) {
    const next = SONGS[name] || SONGS.lofi;
    if (next === song) return;
    const playing = !!timer;
    if (playing) stopLoop();
    song = next; STEP = 60 / song.bpm / 4;
    if (playing) startLoop();
  }
  function setSfx(on) { prefs.sfx = !!on; savePrefs(); notify(); }
  function onChange(fn) { listeners.push(fn); }
  function notify() { listeners.forEach((fn) => { try { fn(Object.assign({}, prefs)); } catch (e) { /* ignore */ } }); }

  // 最初の操作で音を出せるようにする
  function unlock() {
    if (!ensure()) return;
    const go = () => startLoop();
    if (ready()) go(); else ctx.resume().then(go, () => {});
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().then(() => startLoop(), () => {});
  });

  root.Sound = { sfx, playBgm, setBgm, setSfx, setSong, onChange, get prefs() { return Object.assign({}, prefs); } };
})(window);
