/*
 * ログは嘘をつかない — 購買部の品ぞろえ
 * 品物の名前・値段・効果の説明と、ドット絵（12×12）。効果そのものは game.js が実装する。
 *   kind: consumable（消耗品。モニター上部のアイテム欄から使う。各 max 個まで）
 *         tool（調査ツール。一度買えばずっと使える。答えは教えず、調べる手間を減らすものだけ）
 *         deco（机の飾り。見た目だけ）
 *         tape（BGMのカセット）
 *   from: 購買部に並び始める日
 *   where: 道具を買ったあと、画面のどこに出てくるか（購買部のカードに出す）
 */
(function (root) {
  'use strict';

  const K = '#1c1f33', W = '#fbf7ea';
  const ITEMS = [
    // ---------------------------------------------------------------- 消耗品
    { id: 'coffee', kind: 'consumable', name: '缶コーヒー', price: 120, max: 3, from: 1,
      desc: 'ゲーム内の時計を30分戻す。',
      pal: { k: K, w: W, g: '#9aa3b8', b: '#7a4a2a', o: '#c8874a' },
      px: ['....kkkk....', '...kggggk...', '...kwwwwk...', '...kbbbbk...', '...kbookk...', '...kbobbk...', '...kbookk...', '...kbbbbk...', '...kbbbbk...', '...kwwwwk...', '...kggggk...', '....kkkk....'] },
    { id: 'treat', kind: 'consumable', name: '先輩へのおごり', price: 150, max: 3, from: 1,
      desc: 'Kさんにおにぎりをおごる。次のヒント1回が減点なし。',
      pal: { k: K, w: W, n: '#26402f', p: '#e7dfc7' },
      px: ['.....kk.....', '....kwwk....', '...kwwwwk...', '...kwwwwk...', '..kwwwwwwk..', '..kwwpwwwk..', '.kwwwwwwwwk.', '.kwwnnnnwwk.', 'kwwwnnnnwwwk', 'kwwwnnnnwwwk', 'kwwwnnnnwwwk', 'kkkkkkkkkkkk'] },
    { id: 'medicine', kind: 'consumable', name: '胃薬', price: 200, max: 3, from: 1,
      desc: '次の差し戻し1回の減点をなくす。',
      pal: { k: K, w: W, r: '#e43b44', b: '#5b8fd6' },
      px: ['...kkkkkk...', '...krrrrk...', '...krrrrk...', '..kkkkkkkk..', '..kwwwwwwk..', '..kwbbbbwk..', '..kwbwwbwk..', '..kwbbbbwk..', '..kwwwwwwk..', '..kwwwwwwk..', '..kwwwwwwk..', '..kkkkkkkk..'] },
    { id: 'gift', kind: 'consumable', name: '菓子折り', price: 400, max: 3, from: 1,
      desc: '部長に持っていくと、始末書を1枚取り消してもらえる。',
      pal: { k: K, w: W, r: '#e43b44', y: '#fee761', p: '#f2b5c0' },
      px: ['....y..y....', '...yky.yky..', '....yyyy....', 'kkkkkrrkkkkk', 'kppppprpppk.', 'kppppprppppk', 'krrrrrrrrrrk', 'kppppprppppk', 'kppppprppppk', 'kppppprppppk', 'kppppprppppk', 'kkkkkkkkkkkk'] },
    { id: 'energy', kind: 'consumable', name: 'エナジードリンク', price: 300, max: 3, from: 1,
      desc: '次の10回のクエリは、実行しても時計が進まない。',
      pal: { k: K, w: W, g: '#9aa3b8', y: '#fee761', d: '#2b2f45' },
      px: ['....kkkk....', '...kggggk...', '...kddddk...', '...kddydk...', '...kdyydk...', '...kyyddk...', '...kdyddk...', '...kdydk....', '...kddddk...', '...kddddk...', '...kggggk...', '....kkkk....'] },
    { id: 'review', kind: 'consumable', name: 'ダブルチェック依頼', price: 250, max: 3, from: 1,
      desc: '回答する前に、同僚が「結論」と「根拠」がそれぞれ合っているかを○×で教えてくれる。減点なし。',
      pal: { k: K, w: W, b: '#b5651d', g: '#3e8948', r: '#e43b44' },
      px: ['....kkkk....', '.kkkkwwkkkk.', '.kbbkkkkbbk.', '.kbwwwwwwbk.', '.kbwwwwwgbk.', '.kbgwwwgwbk.', '.kbwgwgwwbk.', '.kbwwgwwwbk.', '.kbrwrwwwbk.', '.kbwrwwwwbk.', '.kbrwrwwwbk.', '.kkkkkkkkkk.'] },
    { id: 'radar', kind: 'consumable', name: 'Kさんの調査メモ', price: 180, max: 3, from: 1,
      desc: 'いまのチケットで見るべきテーブルに、テーブル定義で★印がつく。',
      pal: { k: K, y: '#fee761', o: '#f7a823', r: '#e43b44' },
      px: ['kkkkkkkkkkk.', 'kyyyyyyyyyk.', 'kyyyyryyyyk.', 'kyyyrrryyyk.', 'kyrrrrrrryk.', 'kyyrrrrryyk.', 'kyyrryrryyk.', 'kyyyyyyyyyk.', 'kykkkkkkyyk.', 'kyyyyyyyyok.', 'kykkkkyyook.', 'kkkkkkkkkkk.'] },

    // ---------------------------------------------------------------- 道具（調査ツール）
    { id: 'idcard', kind: 'tool', name: 'CS管理画面の権限', price: 400, from: 1, where: '問い合わせ票',
      desc: '問い合わせ票の公開IDの横に、内部の user_id が出る。クリックでエディタに入る。',
      pal: { k: K, w: W, b: '#5b8fd6', s: '#f2c79b', d: '#5d6578' },
      px: ['...kkkkkk...', '...kbbbbk...', '....kbbk....', 'kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kwwwwwwwwwwk', 'kwsskwkkkkwk', 'kwsskwwwwwwk', 'kwddkwkkkwwk', 'kwddkwwwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk'] },
    { id: 'recipes', kind: 'tool', name: '調査の定石ノート', price: 500, from: 1, where: '資料の［運用メモ］',
      desc: '先輩のノートの写し。「受付日の前後で絞る」「トレード相手を調べる」などのSQLのひな形を、いまのチケットのユーザー入りで呼び出せる。',
      pal: { k: K, w: W, g: '#3e8948', r: '#e43b44' },
      px: ['.kkkkkkkkkk.', '.kggggggggk.', '.kgwwwwwwgk.', '.kgwkkkkwgk.', '.kgwwwwwwgk.', '.kgwkkkwwgk.', '.kgwwwwwwgk.', '.kgwkkkkwgk.', '.kgwwwwwwgk.', '.kggggggggk.', '.kkkkkrkkkk.', '......r.....'] },
    { id: 'memo', kind: 'tool', name: '付箋メモ', price: 600, from: 1, where: '資料の［付箋］',
      desc: 'よく使うSQLを5本まで保存して、ワンクリックで呼び出せる（右の資料に「付箋」タブ）。',
      pal: { k: K, y: '#fee761', o: '#f7a823', p: '#f6757a', b: '#8890cf' },
      px: ['............', '.kkkkkkk....', '.kpppppk....', '.kpkkkpkkkk.', '.kpppppyyyk.', '.kkkkkkkyyk.', '...kyyyyyyk.', '...kykkkkyk.', '...kyyyyyyk.', '...kykkkyyk.', '...kyyyyyok.', '...kkkkkkkk.'] },
    { id: 'sort', kind: 'tool', name: '結果の並べ替え', price: 700, from: 1, where: '結果の表',
      desc: '結果の表の見出しをクリックで並べ替え。表の上の欄で行を絞り込める。',
      pal: { k: K, w: W, c: '#2ce8f5', g: '#63c74d' },
      px: ['kkkkkkkk....', 'kcccccck..g.', 'kwwwwwwk.ggg', 'kkkkkkkkgggg', 'kwwwwwwk..g.', 'kkkkkkkk..g.', 'kwwwwwwk..g.', 'kkkkkkkk..g.', 'kwwwwwwkgggg', 'kkkkkkkk.ggg', 'kwwwwwwk..g.', 'kkkkkkkk....'] },
    { id: 'drill', kind: 'tool', name: 'IDたどりルーペ', price: 800, from: 2, where: '結果の表',
      desc: '結果の item_id・user_id・stage_id などのセルに虫めがねが付く。押すと参照先のテーブルを引いて、名前や中身がすぐ分かる。',
      pal: { k: K, w: W, c: '#9be7f0', b: '#b5651d' },
      px: ['...kkkkk....', '..kccccck...', '.kcwccccck..', '.kcwccccck..', '.kccccccck..', '.kccccccck..', '..kccccck...', '...kkkkkbk..', '........bbk.', '.........bbk', '..........bk', '............'] },
    { id: 'marker', kind: 'tool', name: '蛍光ペン', price: 600, from: 3, where: '結果の表',
      desc: '結果の表で、問い合わせてきたユーザーの user_id は黄色、受付日の日時は緑に塗られる。他人の行や日付のズレに気づきやすい。',
      pal: { k: K, y: '#fee761', g: '#63c74d', d: '#5d6578' },
      px: ['.........kk.', '........kddk', '.......kddk.', '......kddk..', '.....kddk...', '....kddk....', '...kyyk.....', '..kyyk......', '.kyyk.......', '.kkk........', 'yyyyyyyyyy..', 'gggggggggg..'] },
    { id: 'complete', kind: 'tool', name: '列名の補完', price: 900, from: 3, where: 'SQLエディタ',
      desc: 'エディタでテーブル名・列名の候補が出る。Tab で確定。',
      pal: { k: K, w: W, c: '#2ce8f5', d: '#1d223a' },
      px: ['kkkkkkkkkkkk', 'kddddddddddk', 'kdwwdwdddddk', 'kdwdwdwwdddk', 'kdwwdwdwdcdk', 'kdwdwdwwdcdk', 'kddddddddcdk', 'kkkkkkkkkkkk', '..kwwwwwwk..', '..kcccwwwk..', '..kwwwwwwk..', '..kkkkkkkk..'] },
    { id: 'submon', kind: 'tool', name: 'サブモニター', price: 1000, from: 5, where: '結果の表',
      desc: 'IDたどりルーペの虫めがねで引いた結果が、いまの結果の横のサブモニターに出る。元の表もエディタもそのまま。',
      pal: { k: K, b: '#dcd2b4', d: '#ab9f7e', s: '#161a2e', c: '#2ce8f5' },
      px: ['kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbsssssssssk', 'kbscccsssbbk', 'kbsssssssbbk', 'kbscccccsbbk', 'kbsssssssbbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', '....kddk....', '..kkkddkkk..', '..kkkkkkkk..'] },
    { id: 'timeline', kind: 'tool', name: '行動タイムライン', price: 1800, from: 6, where: '問い合わせ票',
      desc: '問い合わせ票に［行動タイムライン］ボタン。そのユーザーの log_ テーブル9つを、受付日までの数日ぶん1つの表に時系列で並べる。',
      pal: { k: K, w: W, o: '#f7a823', c: '#2ce8f5', p: '#f6757a' },
      px: ['kkkkkkkkkkkk', 'kwwwwwwwwwwk', 'kwowwwwwwwwk', 'kwokkkkkwwwk', 'kwowwwwwwwwk', 'kwcwwwwwwwwk', 'kwckkkkkkkwk', 'kwcwwwwwwwwk', 'kwpwwwwwwwwk', 'kwpkkkkwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk'] },
    { id: 'erd', kind: 'tool', name: 'テーブル関係図', price: 1200, from: 8, where: '資料の［関係図］',
      desc: 'どのテーブルが、どの列でつながっているかの図（右の資料に「関係図」タブ）。',
      pal: { k: K, w: W, b: '#8890cf', g: '#63c74d', o: '#f7a823' },
      px: ['kkkkk.......', 'kbbbk.......', 'kwwwk.......', 'kkkkk.......', '..k.........', '..kkkkk.kkkk', '..k...k.kook', '..k...kkkwwk', 'kkkkk...kkkk', 'kgggk.......', 'kwwwk.......', 'kkkkk.......'] },
    { id: 'chair', kind: 'tool', name: 'ゲーミングチェア', price: 1500, from: 10, where: 'ゲーム内時計',
      desc: '座り心地がよすぎて、時計の進みが1割遅くなる。',
      pal: { k: K, r: '#e43b44', d: '#2b2f45', g: '#9aa3b8' },
      px: ['...kkkkkk...', '...krrrrk...', '...kdrrdk...', '...kdrrdk...', '...kdrrdk...', '...kdrrdk...', '.kkkkkkkkkk.', '.kddddddddk.', '.kkkkkkkkkk.', '.....kk.....', '..kkkkkkkk..', '..k.k..k.k..'] },

    // ---------------------------------------------------------------- 机の飾り
    { id: 'plant', kind: 'deco', name: '観葉植物', price: 200, from: 1, desc: 'モニターの横に置く。',
      pal: { k: K, g: '#63c74d', d: '#2f7d3b', b: '#b5651d', o: '#d9894a' },
      px: ['....g..g....', '...ggdggd...', '..gddggddg..', '.ggdgggdgg..', '..gdggggdgg.', '...ggddgg...', '....dgdd....', '..kkkkkkkk..', '..kooooook..', '...kbbbbk...', '...kbbbbk...', '...kkkkkk...'] },
    { id: 'cat', kind: 'deco', name: '猫のフィギュア', price: 300, from: 1, desc: 'ずっとこっちを見ている。',
      pal: { k: K, w: W, o: '#f7a823', p: '#f6757a' },
      px: ['.k......k...', '.kk....kk...', '.kokkkkok...', '.koooooook..', '.kokoookok..', '.kooopooook.', '..kooooook..', '..kowwwok...', '.koowwwook..', '.koooooookk.', '.kooooooook.', '..kkkkkkkk..'] },
    { id: 'lamp', kind: 'deco', name: '卓上ライト', price: 400, from: 1, desc: '夜の残業がちょっと明るくなる。',
      pal: { k: K, y: '#fee761', g: '#5d6578', l: '#ffe9a8' },
      px: ['..kkkkkk....', '.kggggggk...', 'kggggggggk..', 'kkkkkkkkkk..', '.lyyyyyyl...', '..l.kk.l....', '.....kk.....', '.....kk.....', '.....kk.....', '.....kk.....', '...kkkkkk...', '..kggggggk..'] },
    { id: 'poster', kind: 'deco', name: 'ポスター', price: 300, from: 1, desc: '「ログは嘘をつかない」の標語入り。',
      pal: { k: K, w: W, r: '#e43b44', b: '#2858a8', y: '#fee761' },
      px: ['kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbyyyyyyyybk', 'kbyrrrrrrybk', 'kbyrwwwwrybk', 'kbyrwkkwrybk', 'kbyrwwwwrybk', 'kbyrrrrrrybk', 'kbyyyyyyyybk', 'kbwkwkwkwkbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk'] },
    { id: 'bezel', kind: 'deco', name: 'モニター枠の色替え', price: 500, from: 1, desc: 'モニターの枠を黒に塗り替える（購買部で戻せる）。',
      pal: { k: K, w: W, d: '#2b2f45', g: '#9aa3b8' },
      px: ['............', '..kkkkkkkk..', '.kggggggggk.', '.kkkkkkkkkk.', '.kddddddddk.', '.kddddddddk.', '.kddwdddddk.', '.kddddddddk.', '.kddddddddk.', '.kddddddddk.', '..kkkkkkkk..', '............'] },
    { id: 'keyboard', kind: 'deco', name: '高級メカニカルキーボード', price: 300, from: 1, desc: 'SQLの実行音が「カチャッ」になる。',
      pal: { k: K, w: W, g: '#9aa3b8', d: '#5d6578', y: '#fee761' },
      px: ['............', '............', '............', 'kkkkkkkkkkkk', 'kwkwkwkwkwkk', 'kkkkkkkkkkkk', 'kwkwkwkwkwyk', 'kkkkkkkkkkkk', 'kwkwwwwwkwkk', 'kkkkkkkkkkkk', 'kddddddddddk', 'kkkkkkkkkkkk'] },

    // ---------------------------------------------------------------- BGMのカセット
    { id: 'tape_chip', kind: 'tape', song: 'chip', name: 'カセット「8bit ラン」', price: 400, from: 1, desc: '速いチップチューン。手が勝手に動く。',
      pal: { k: K, w: W, r: '#e43b44', d: '#2b2f45' },
      px: ['............', 'kkkkkkkkkkkk', 'krrrrrrrrrrk', 'krwwwwwwwwrk', 'krwkkwwkkwrk', 'krwkkwwkkwrk', 'krwwwwwwwwrk', 'krrrrrrrrrrk', 'krrkddddkrrk', 'kkkkkkkkkkkk', '............', '............'] },
    { id: 'tape_city', kind: 'tape', song: 'city', name: 'カセット「シティポップ・ナイト」', price: 400, from: 1, desc: '夜の首都高を流しているような曲。',
      pal: { k: K, w: W, p: '#c38fff', d: '#2b2f45' },
      px: ['............', 'kkkkkkkkkkkk', 'kppppppppppk', 'kpwwwwwwwwpk', 'kpwkkwwkkwpk', 'kpwkkwwkkwpk', 'kpwwwwwwwwpk', 'kppppppppppk', 'kppkddddkppk', 'kkkkkkkkkkkk', '............', '............'] },
    { id: 'tape_rain', kind: 'tape', song: 'rain', name: 'カセット「雨の残業」', price: 400, from: 1, desc: 'ドラムなし。窓の外は雨。',
      pal: { k: K, w: W, c: '#5b8fd6', d: '#2b2f45' },
      px: ['............', 'kkkkkkkkkkkk', 'kcccccccccck', 'kcwwwwwwwwck', 'kcwkkwwkkwck', 'kcwkkwwkkwck', 'kcwwwwwwwwck', 'kcccccccccck', 'kcckddddkcck', 'kkkkkkkkkkkk', '............', '............'] },
  ];
  const BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

  // 品物のドット絵（SVG）
  function art(id, scale) {
    const it = BY_ID[id]; if (!it) return '';
    const s = scale || 3, w = it.px[0].length, h = it.px.length;
    let rects = '';
    it.px.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = it.pal[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
    return `<svg width="${w * s}" height="${h * s}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  root.Shop = { ITEMS, BY_ID, art };
})(window);
