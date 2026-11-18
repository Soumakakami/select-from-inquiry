/*
 * ログは嘘をつかない — 本番DB（ダミー）生成
 * 乱数シード固定なので、誰が遊んでも同じデータになる。
 * DBに入る日時はすべて日本時間（JST）の 'YYYY-MM-DD HH:MM:SS' 文字列。
 * 生成処理の中（このファイルに書かれた時刻、プレイ時間帯、ブラックアウト期間など）は
 * UTC で組み立て、DBに書き出すときにだけ toJ / fmtJ で +9時間して JST にする。
 */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const toT = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)) / 1000;
  const fmt = (t) => new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const JST_OFFSET = 9 * 3600;
  const fmtJ = (t) => fmt(t + JST_OFFSET); // 内部の UTC 秒 → DBに入れる JST 文字列
  const toJ = (s) => (s == null ? null : fmtJ(toT(s))); // 内部の UTC 文字列 → JST 文字列

  const WSTART = '2026-10-20 00:00:00'; // UTC
  const WEND = '2026-11-13 01:00:00'; // UTC。JST 11/13 10:00 = ゲーム内の「今」

  const SCHEMA = `
CREATE TABLE mst_worlds (
  world_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE usr_users (
  user_id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE usr_characters (
  character_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  world_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  job TEXT NOT NULL,
  level INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE mst_items (
  item_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  tradable INTEGER NOT NULL
);
CREATE TABLE mst_products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_jpy INTEGER NOT NULL,
  gem INTEGER NOT NULL
);
CREATE TABLE log_login (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  result TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  country TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE log_character (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE log_item (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  character_id INTEGER,
  item_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  target_user_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE mst_equips (
  equip_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  tradable INTEGER NOT NULL,
  attack INTEGER NOT NULL,
  defense INTEGER NOT NULL
);
CREATE TABLE usr_equips (
  equip_uid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  character_id INTEGER,
  equip_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  in_storage INTEGER NOT NULL,
  obtained_at TEXT NOT NULL
);
CREATE TABLE log_equip (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  character_id INTEGER,
  equip_id INTEGER NOT NULL,
  equip_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE mst_events (
  event_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  world_id INTEGER,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  description TEXT
);
CREATE TABLE mst_gachas (
  gacha_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_id TEXT,
  gem_single INTEGER NOT NULL,
  gem_ten INTEGER NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT
);
CREATE TABLE mst_gacha_lineups (
  lineup_id INTEGER PRIMARY KEY,
  gacha_id TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_id INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  rate INTEGER NOT NULL
);
CREATE TABLE usr_gachas (
  user_id INTEGER NOT NULL,
  gacha_id TEXT NOT NULL,
  draw_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, gacha_id)
);
CREATE TABLE mst_gacha_ceilings (
  ceiling_id INTEGER PRIMARY KEY,
  gacha_id TEXT NOT NULL,
  required_count INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_id INTEGER NOT NULL
);
CREATE TABLE usr_gacha_ceilings (
  user_id INTEGER NOT NULL,
  gacha_id TEXT NOT NULL,
  ceiling_count INTEGER NOT NULL,
  exchanged_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, gacha_id)
);
CREATE TABLE mst_missions (
  mission_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  mission_type TEXT NOT NULL,
  event_id TEXT,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_id INTEGER,
  reward_quantity INTEGER NOT NULL
);
CREATE TABLE usr_missions (
  user_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  progress INTEGER NOT NULL,
  cleared_at TEXT,
  received_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mission_id)
);
CREATE TABLE log_gacha (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  gacha_id TEXT NOT NULL,
  currency_log_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_id INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE mst_stages (
  stage_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  stage_type TEXT NOT NULL,
  event_id TEXT,
  recommended_level INTEGER NOT NULL,
  stamina INTEGER NOT NULL,
  boss_name TEXT NOT NULL,
  drop_item_id INTEGER
);
CREATE TABLE log_stage (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  character_id INTEGER,
  stage_id INTEGER NOT NULL,
  result TEXT NOT NULL,
  score INTEGER NOT NULL,
  clear_time_sec INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE usr_rankings (
  event_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE usr_presents (
  present_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  present_type TEXT NOT NULL,
  reward_id INTEGER,
  quantity INTEGER NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  received_at TEXT
);
CREATE TABLE log_currency (
  log_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE log_payment (
  payment_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  price_jpy INTEGER NOT NULL,
  store TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE log_error (
  log_id INTEGER PRIMARY KEY,
  level TEXT NOT NULL,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_chars_user ON usr_characters(user_id);
CREATE INDEX idx_login_user ON log_login(user_id, created_at);
CREATE INDEX idx_charlog_user ON log_character(user_id, created_at);
CREATE INDEX idx_item_user ON log_item(user_id, created_at);
CREATE INDEX idx_cur_user ON log_currency(user_id, created_at);
CREATE INDEX idx_pay_user ON log_payment(user_id, created_at);
CREATE INDEX idx_equip_user ON log_equip(user_id, created_at);
CREATE INDEX idx_equip_uid ON log_equip(equip_uid);
CREATE INDEX idx_usr_equip_user ON usr_equips(user_id);
CREATE INDEX idx_gacha_user ON log_gacha(user_id, created_at);
CREATE INDEX idx_stage_user ON log_stage(user_id, created_at);
CREATE INDEX idx_present_user ON usr_presents(user_id, created_at);
`;

  const ITEMS = [
    [1001, 'ポーション', '消耗品', 'N', 1], [1002, 'ハイポーション', '消耗品', 'R', 1], [1003, 'エーテル', '消耗品', 'R', 1],
    [1004, 'エリクサー', '消耗品', 'SR', 1], [1101, '強化石', '素材', 'N', 1], [1102, '上級強化石', '素材', 'R', 1],
    [1103, '保護の巻物', '消耗品', 'SR', 0], [1201, 'ワールド移動チケット', '消耗品', 'SR', 0], [1202, '名前変更チケット', '消耗品', 'SR', 0],
    [1301, '魔獣の牙', '素材', 'N', 1], [1302, '精霊の羽', '素材', 'R', 1], [1303, '古代のコア', '素材', 'SR', 1],
    [2001, '鉄の剣', '武器', 'N', 1], [2002, 'ミスリルソード', '武器', 'R', 1], [2003, '樫の杖', '武器', 'N', 1],
    [2004, '賢者の杖', '武器', 'SR', 1], [2005, '狩人の弓', '武器', 'R', 1], [2006, '双月の短剣', '武器', 'SR', 1],
    [2101, '革の鎧', '防具', 'N', 1], [2102, '騎士の鎧', '防具', 'R', 1], [2103, '聖衣ルミナ', '防具', 'SSR', 1],
    [2201, '守りの指輪', 'アクセサリ', 'R', 1], [2202, '疾風のブーツ', '防具', 'SR', 1],
    [3001, '白馬（30日）', 'マウント', 'SR', 0], [3002, '魔導バイク（7日）', 'マウント', 'SSR', 0],
    [5001, '深淵の指輪', 'アクセサリ', 'SSR', 1], [5002, '蒼炎の杖', '武器', 'SSR', 1],
    [5012, '煌星の大剣', '武器', 'UR', 0], [5020, '天穹の弓', '武器', 'UR', 1], [5031, '竜鱗の外套', '防具', 'SSR', 1],
    [5040, '星詠みの耳飾り', 'アクセサリ', 'SSR', 1],
  ];
  // 武器・防具・アクセサリは mst_equips に分ける（ID はそのまま）
  const EQUIP_CATS = ['武器', '防具', 'アクセサリ'];
  const MST_ITEMS = ITEMS.filter((i) => !EQUIP_CATS.includes(i[2]));
  const MST_EQUIPS = ITEMS.filter((i) => EQUIP_CATS.includes(i[2])).map(([id, name, cat, rar, trad]) => {
    const base = { N: 10, R: 25, SR: 45, SSR: 80, UR: 120 }[rar];
    const atk = cat === '武器' ? base * 2 : cat === 'アクセサリ' ? Math.round(base / 2) : 0;
    const def = cat === '防具' ? base * 2 : cat === 'アクセサリ' ? Math.round(base / 2) : 0;
    return [id, name, cat, rar, trad, atk, def];
  });
  const EQUIP_IDS = new Set(MST_EQUIPS.map((e) => e[0]));

  // イベント（日時は JST の文字列。DBにそのまま入れる）
  const EVENTS = [
    ['ev_halloween', 'ハロウィンイベント', 'SEASONAL', null, '2026-10-15 12:00:00', '2026-10-31 23:59:59', '期間限定ステージ「かぼちゃ畑の大騒動」とハロウィンガチャを開催'],
    ['ev_raid_star', '星喰いの竜 討伐戦', 'RAID', null, '2026-10-25 12:00:00', '2026-11-08 23:59:59', 'レイドボス「星喰いの竜」の与ダメージを競うランキングイベント'],
    ['ev_autumn', '秋の大感謝祭', 'CAMPAIGN', null, '2026-11-01 12:00:00', '2026-11-15 23:59:59', '大感謝祭ガチャと特設ステージ「大感謝祭の宝物庫」を開催'],
    ['ev_guild', 'ギルド貢献ランキング', 'RANKING', null, '2026-11-01 00:00:00', '2026-11-14 23:59:59', 'ギルドへのゴールド寄付額を競うランキング'],
    ['ev_gamma', 'ガンマ開拓祭', 'WORLD', 3, '2026-11-05 12:00:00', '2026-11-19 23:59:59', 'ワールド「ガンマ」限定のイベント。ワールド移動チケットをジェムショップで販売'],
    ['ev_login_11', '11月ログインボーナス', 'LOGIN_BONUS', null, '2026-11-01 00:00:00', '2026-11-30 23:59:59', '毎日のログインでプレゼントBOXに報酬が届く'],
  ];
  // ガチャ（gacha_id は log_currency.ref_id の 'gacha:〜' と同じ）
  const GACHAS = [
    ['standard', '常設ガチャ', null, 300, 3000, '2024-04-01 12:00:00', null],
    ['halloween', 'ハロウィンガチャ', 'ev_halloween', 300, 3000, '2026-10-15 12:00:00', '2026-10-31 23:59:59'],
    ['2026_autumn', '秋の大感謝祭ガチャ', 'ev_autumn', 300, 3000, '2026-11-01 12:00:00', '2026-11-15 23:59:59'],
  ];
  // 排出テーブル（rate は千分率。各ガチャで合計 1000）
  const GACHA_POOL = [
    ['ITEM', 1001, 'N', 180], ['ITEM', 1101, 'N', 170], ['EQUIP', 2001, 'N', 50], ['EQUIP', 2003, 'N', 50], ['EQUIP', 2101, 'N', 50],
    ['ITEM', 1002, 'R', 90], ['ITEM', 1003, 'R', 80], ['ITEM', 1102, 'R', 80], ['EQUIP', 2002, 'R', 30], ['EQUIP', 2005, 'R', 25], ['EQUIP', 2102, 'R', 25], ['EQUIP', 2201, 'R', 20],
    ['ITEM', 1004, 'SR', 40], ['ITEM', 1103, 'SR', 30], ['EQUIP', 2004, 'SR', 17], ['EQUIP', 2006, 'SR', 17], ['EQUIP', 2202, 'SR', 16],
    ['EQUIP', 2103, 'SSR', 10], ['EQUIP', 5001, 'SSR', 10], ['EQUIP', 5002, 'SSR', 10],
  ];
  const PICKUP = { halloween: 5002, '2026_autumn': 5001 }; // 限定ガチャはピックアップのSSRだけ確率アップ
  const LINEUPS = [];
  GACHAS.forEach(([gid]) => GACHA_POOL.forEach(([type, id, rar, rate]) => {
    let r = rate;
    if (rar === 'SSR' && PICKUP[gid]) r = id === PICKUP[gid] ? 20 : 5;
    LINEUPS.push([LINEUPS.length + 1, gid, type, id, rar, r]);
  }));
  // 天井（交換型）：1回まわすごとに1ポイント。required_count に届くと、どれか1つと交換できる。交換するとポイントは0に戻る
  const CEILINGS = [
    [1, 'standard', 200, 'EQUIP', 2103], [2, 'standard', 200, 'EQUIP', 5001], [3, 'standard', 200, 'EQUIP', 5002],
    [4, 'halloween', 100, 'EQUIP', 5002],
    [5, '2026_autumn', 100, 'EQUIP', 5001],
  ];
  // ミッション。DAILY は今日（11/13）、WEEKLY は今週（11/9 月曜〜）、EVENT はイベント期間、BEGINNER は 11/1 以降に作ったアカウントが対象
  const MISSIONS = [
    [1, 'ログインする', 'DAILY', null, 'LOGIN', 1, 'ITEM', 1001, 3],
    [2, 'ステージを3回クリアする', 'DAILY', null, 'STAGE_CLEAR', 3, 'ITEM', 1101, 3],
    [3, 'ガチャを1回まわす', 'DAILY', null, 'GACHA_DRAW', 1, 'GEM', null, 10],
    [11, '5日ログインする', 'WEEKLY', null, 'LOGIN', 5, 'GEM', null, 50],
    [12, 'ステージを15回クリアする', 'WEEKLY', null, 'STAGE_CLEAR', 15, 'ITEM', 1102, 3],
    [13, 'レイドを3回クリアする', 'WEEKLY', null, 'RAID_CLEAR', 3, 'ITEM', 1303, 1],
    [21, '大感謝祭：ガチャを30回まわす', 'EVENT', 'ev_autumn', 'GACHA_DRAW', 30, 'GEM', null, 300],
    [22, '大感謝祭：ステージを20回クリアする', 'EVENT', 'ev_autumn', 'STAGE_CLEAR', 20, 'ITEM', 1004, 1],
    [23, '大感謝祭：強化を10回成功させる', 'EVENT', 'ev_autumn', 'ENHANCE_SUCCESS', 10, 'ITEM', 1103, 1],
    [24, 'ギルドに合計10万ゴールド寄付する', 'EVENT', 'ev_guild', 'GUILD_DONATE', 100000, 'GEM', null, 100],
    [31, 'はじめて：キャラクターを作成する', 'BEGINNER', null, 'CHARACTER_CREATE', 1, 'GEM', null, 100],
    [32, 'はじめて：ステージをクリアする', 'BEGINNER', null, 'STAGE_CLEAR', 1, 'ITEM', 1001, 5],
  ];
  // ステージ
  const STAGES = [
    [101, '1-1 草原の入口', 'はじまりの草原', 'NORMAL', null, 1, 5, 'スライム', 1301],
    [102, '1-2 風の丘', 'はじまりの草原', 'NORMAL', null, 4, 5, 'ワイルドボア', 1301],
    [103, '1-3 古い風車', 'はじまりの草原', 'NORMAL', null, 8, 6, 'ゴブリン隊長', 1101],
    [201, '2-1 森の小道', 'ささやきの森', 'NORMAL', null, 12, 8, 'フォレストウルフ', 1301],
    [202, '2-2 精霊の泉', 'ささやきの森', 'NORMAL', null, 16, 8, 'ウンディーネ', 1302],
    [203, '2-3 大樹の根元', 'ささやきの森', 'NORMAL', null, 20, 9, 'トレント', 1302],
    [301, '3-1 砂丘', '灼熱の砂漠', 'NORMAL', null, 26, 10, 'サンドワーム', 1101],
    [302, '3-2 オアシス', '灼熱の砂漠', 'NORMAL', null, 31, 10, 'デザートスコーピオン', 1302],
    [303, '3-3 王家の墓', '灼熱の砂漠', 'NORMAL', null, 36, 12, 'ファラオ', 1303],
    [401, '4-1 氷柱の回廊', '氷結の洞窟', 'NORMAL', null, 45, 12, 'アイスゴーレム', 1102],
    [402, '4-2 凍てつく湖', '氷結の洞窟', 'NORMAL', null, 52, 14, 'フロストサーペント', 1303],
    [403, '4-3 氷晶の玉座', '氷結の洞窟', 'NORMAL', null, 58, 15, '氷の女王', 1303],
    [501, '5-1 魔王城の門', '魔王城', 'NORMAL', null, 68, 16, 'ガーゴイル', 1102],
    [502, '5-2 血の回廊', '魔王城', 'NORMAL', null, 78, 18, 'デスナイト', 1303],
    [503, '5-3 玉座の間', '魔王城', 'NORMAL', null, 88, 20, '魔王ヴァルガス', 1303],
    [801, 'かぼちゃ畑の大騒動', 'ハロウィン特設', 'EVENT', 'ev_halloween', 20, 10, 'ジャック・オ・ランタン', 1302],
    [802, '大感謝祭の宝物庫', '秋の大感謝祭', 'EVENT', 'ev_autumn', 30, 10, 'ゴールデンミミック', 1102],
    [901, 'レイド:星喰いの竜', 'レイド', 'RAID', 'ev_raid_star', 80, 30, '星喰いの竜', 1303],
    [902, 'レイド:天空の覇者', 'レイド', 'RAID', null, 75, 30, '天空の覇者', 1303],
    [903, 'レイド:竜王の巣', 'レイド', 'RAID', null, 85, 30, '竜王', 1303],
  ];

  const PRODUCTS = [
    ['gem_pack_120', 'ジェム 60個', 120, 60], ['gem_pack_610', 'ジェム 330個', 610, 330], ['gem_pack_980', 'ジェム 560個', 980, 560],
    ['gem_pack_3000', 'ジェム 1,800個', 3000, 1800], ['gem_pack_5000', 'ジェム 3,100個', 5000, 3100], ['gem_pack_10000', 'ジェム 6,500個', 10000, 6500],
  ];

  const RESERVED = new Set(['シルフィ', 'グラン', 'ヴォルフ', 'ハヤテ', '漆黒の堕天使', 'ノワール', 'ミナト', 'ルナマリア', 'ミルク', 'みるく', '影狼', 'ポポロン']);
  const NAME_BASE = ['アリス', 'レオン', 'クロウ', 'ルナ', 'セツナ', 'カイト', 'ユキ', 'リリィ', 'ジーク', 'ノア', 'ミア', 'ラグナ', 'ソラ', 'ヒカリ',
    'シオン', 'アスカ', 'ゼロ', 'リン', 'ツバサ', 'カグヤ', 'アオイ', 'ハル', 'フレイ', 'ティア', 'マオ', 'ガイ', 'エル', 'ナギ', 'イリス',
    'もち', 'たまご', 'こむぎ', 'さくら', 'ぽてと', '月影', '紅蓮', '蒼天', '白夜', '雷電', '桜花', '朧', '黒猫', '豆腐', 'ねこまる',
    'Kaito', 'Yuki', 'Shadow', 'Nova', 'Raven', 'Ash'];
  const NAME_SUFFIX = ['', '', '', '★', 'さん', 'ちゃん', '_jp', '777', 'Ω', '改', '二世', '00', 'α'];
  const JOBS = ['剣士', '魔法使い', '弓使い', '僧侶', '盗賊'];

  function generate(seed) {
    const rnd = mulberry32(seed || 20261113);
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const chance = (p) => rnd() < p;
    const T0 = toT(WSTART), T1 = toT(WEND);
    const itemById = Object.fromEntries(ITEMS.map((i) => [i[0], i]));
    const productById = Object.fromEntries(PRODUCTS.map((p) => [p[0], p]));

    // ---------------- users ----------------
    const usedPub = new Set();
    const usedIp = new Set(['126.204.33.17', '219.110.5.88', '153.240.17.62', '180.17.230.4', '49.106.11.200', '111.239.160.33',
      '60.112.45.201', '185.220.101.47', '114.150.82.9', '49.98.140.77', '221.118.40.12']);
    const randIp = (country) => {
      let ip;
      const firsts = { JP: [60, 61, 114, 118, 119, 122, 124, 126, 133, 153, 175, 180, 202, 210, 219, 220, 221, 49], TW: [1, 36, 114, 220], KR: [58, 112, 121, 175], US: [24, 47, 67, 73, 98] }[country];
      do { ip = `${pick(firsts)}.${int(1, 254)}.${int(0, 254)}.${int(1, 254)}`; } while (usedIp.has(ip));
      usedIp.add(ip); return ip;
    };
    const devModels = { iOS: ['iPhone13,2', 'iPhone14,5', 'iPhone15,2', 'iPhone15,4', 'iPhone16,1'], Android: ['SM-S918', 'SO-51D', 'Pixel7', 'Pixel8', 'SH-M26', 'A301SH'], PC: ['PC-WIN', 'PC-WIN', 'PC-MAC'] };
    const hex4 = () => int(0, 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const randDevice = (platform) => `${pick(devModels[platform])}-${hex4()}`;

    const users = [];
    function mkUser(o) {
      const u = Object.assign({ status: 'ACTIVE', country: 'JP', activity: 0.6, chars: [], blackout: [], scriptedOnly: false, noPayments: false, noTrades: false, noBigGold: false, activeFrom: null, activeUntil: null, gold0: null }, o);
      if (!u.pub) { let p; do { p = 'U-' + int(10000, 99999); } while (usedPub.has(p)); u.pub = p; }
      usedPub.add(u.pub);
      u.createdT = toT(u.created);
      users.push(u); return u;
    }
    // noise users
    for (let i = 0; i < 150; i++) {
      const platform = pick(['iOS', 'iOS', 'Android', 'Android', 'PC']);
      const country = chance(0.92) ? 'JP' : pick(['TW', 'KR', 'US']);
      const createdT = chance(0.12) ? int(toT('2026-09-01 00:00:00'), toT('2026-11-06 00:00:00')) : int(toT('2024-04-01 00:00:00'), toT('2026-09-01 00:00:00'));
      const nIp = int(1, 3);
      const u = mkUser({
        platform, country, created: fmt(createdT),
        devices: [randDevice(platform)].concat(chance(0.15) ? [randDevice(platform)] : []),
        ips: Array.from({ length: nIp }, () => randIp(country)),
        activity: 0.15 + rnd() * 0.8,
        status: chance(0.03) ? 'BANNED' : 'ACTIVE',
      });
      u.noise = true;
    }
    const noiseUsers = users.slice();
    const S = {}; // scripted users
    S.c1 = mkUser({ pub: 'U-38127', platform: 'iOS', created: '2025-11-02 09:12:44', devices: ['iPhone15,2-7F3A'], ips: ['126.204.33.17'], activity: 0.8, blackout: [['2026-11-03 10:00:00', '2026-11-03 15:00:00']] });
    S.c2 = mkUser({ pub: 'U-52904', platform: 'PC', created: '2024-09-18 13:40:00', devices: ['PC-WIN-4D10'], ips: ['219.110.5.88'], activity: 0.85, blackout: [['2026-11-11 11:00:00', '2026-11-11 15:00:00']] });
    S.c3 = mkUser({ pub: 'U-27730', platform: 'Android', created: '2025-03-21 11:05:19', devices: ['SH-M26-91B4'], ips: ['153.240.17.62'], activity: 0.8, noBigGold: true, gold0: 4950000, blackout: [['2026-11-07 18:00:00', '2026-11-08 13:00:00']] });
    S.c4 = mkUser({ pub: 'U-44590', platform: 'iOS', created: '2025-01-08 12:30:41', devices: ['iPhone14,5-0C2E'], ips: ['180.17.230.4', '49.106.11.200'], activity: 0.7, blackout: [['2026-11-09 09:30:00', '2026-11-09 11:00:00']] });
    S.c5 = mkUser({ pub: 'U-73315', platform: 'Android', created: '2026-05-02 10:44:03', devices: ['Pixel8-5E21'], ips: ['111.239.160.33'], activity: 0.75, noPayments: true, blackout: [['2026-11-10 10:30:00', '2026-11-10 12:30:00'], ['2026-11-05 09:30:00', '2026-11-05 10:30:00']] });
    S.c6 = mkUser({ pub: 'U-61458', platform: 'Android', created: '2024-12-24 13:00:12', devices: ['SM-S918-2B71'], ips: ['60.112.45.201'], activity: 0.9, noTrades: true, blackout: [['2026-11-08 11:30:00', '2026-11-08 13:30:00']], activeUntil: '2026-11-11 15:00:00' });
    S.c6x = mkUser({ pub: 'U-90417', platform: 'PC', created: '2026-11-10 16:44:02', devices: ['PC-WIN-9C4E'], ips: ['185.220.101.47'], country: 'NL', scriptedOnly: true });
    S.c7 = mkUser({ pub: 'U-15562', platform: 'iOS', created: '2026-11-12 11:02:37', devices: ['iPhone16,1-A9D0'], ips: ['114.150.82.9'], scriptedOnly: true });
    S.c7old = mkUser({ pub: 'U-31846', platform: 'Android', created: '2025-06-03 08:20:15', devices: ['SO-51D-33E8'], ips: ['114.150.82.9', '114.150.82.9', '114.150.82.9', '49.98.140.77'], activity: 0.85, activeUntil: '2026-11-11 22:00:00' });
    // friend of c6 (legit trade partner)
    S.c6f = mkUser({ platform: 'Android', created: '2025-02-11 12:00:00', devices: ['A301SH-6C02'], ips: ['221.118.40.12'], activity: 0.7 });
    S.c6f.noise = true; noiseUsers.push(S.c6f);

    // user_id は作成順
    users.sort((a, b) => a.createdT - b.createdT || (a.pub < b.pub ? -1 : 1));
    users.forEach((u, i) => { u.id = i + 1; });

    // ---------------- characters ----------------
    const chars = [];
    const liveNames = { 1: new Set(), 2: new Set(), 3: new Set() };
    function mkChar(u, o) {
      const c = Object.assign({ user: u, level: int(1, 99), job: pick(JOBS) }, o);
      c.createdT = toT(c.created);
      c.deletedT = c.deleted ? toT(c.deleted) : null;
      if (!c.deleted) liveNames[c.world].add(c.name);
      u.chars.push(c); chars.push(c); return c;
    }
    function freshName(world) {
      for (;;) {
        const n = pick(NAME_BASE) + pick(NAME_SUFFIX);
        if (!RESERVED.has(n) && !liveNames[world].has(n)) return n;
      }
    }
    // scripted chars
    const K = {}; // scripted objects
    K.sylphy = mkChar(S.c1, { world: 1, name: 'シルフィ', job: '魔法使い', level: 87, created: '2026-02-14 11:20:05', deleted: '2026-11-03 12:42:18' });
    K.gran = mkChar(S.c1, { world: 1, name: 'グラン', job: '剣士', level: 45, created: '2026-06-30 12:01:40' });
    K.wolf = mkChar(S.c2, { world: 2, name: 'ヴォルフ', job: '剣士', level: 92, created: '2024-09-18 13:45:02' });
    K.hayate = mkChar(S.c3, { world: 1, name: 'ハヤテ', job: '盗賊', level: 70, created: '2025-03-21 11:10:44' });
    K.shikkoku = mkChar(S.c4, { world: 3, createdWorld: 1, name: '漆黒の堕天使', job: '魔法使い', level: 66, created: '2025-01-08 12:35:10' });
    K.noir = mkChar(S.c4, { world: 1, name: 'ノワール', job: '盗賊', level: 31, created: '2025-08-19 13:02:55' });
    K.minato = mkChar(S.c5, { world: 2, name: 'ミナト', job: '僧侶', level: 58, created: '2026-05-02 10:50:31' });
    K.luna = mkChar(S.c6, { world: 2, name: 'ルナマリア', job: '弓使い', level: 95, created: '2024-12-24 13:05:40' });
    K.kageroh = mkChar(S.c6x, { world: 2, name: '影狼', job: '盗賊', level: 12, created: '2026-11-10 16:50:13' });
    K.popolon = mkChar(S.c6f, { world: 2, name: 'ポポロン', job: '僧侶', level: 74, created: '2025-02-11 12:10:00' });
    K.milkNew = mkChar(S.c7, { world: 1, name: 'みるく', job: '僧侶', level: 4, created: '2026-11-12 11:10:05' });
    K.milk = mkChar(S.c7old, { world: 1, name: 'ミルク', job: '魔法使い', level: 78, created: '2025-06-03 08:31:22' });

    // decoys on noise users
    const nu = (i) => noiseUsers[i];
    const pickNoiseUser = (pred) => { for (;;) { const u = pick(noiseUsers); if (u !== S.c6f && u.status === 'ACTIVE' && (!pred || pred(u))) return u; } };
    const oldUser = (u) => u.createdT < toT('2025-06-01 00:00:00');
    K.sylphyW2 = mkChar(pickNoiseUser(oldUser), { world: 2, name: 'シルフィ', job: '弓使い', level: 63, created: '2025-07-07 12:07:07' });
    K.sylphyNew = mkChar(pickNoiseUser(oldUser), { world: 1, name: 'シルフィ', job: '魔法使い', level: 9, created: '2026-11-05 03:15:10' });
    K.shikkokuW2 = mkChar(pickNoiseUser(oldUser), { world: 2, name: '漆黒の堕天使', job: '剣士', level: 81, created: '2025-04-01 00:00:44' });
    K.milkW2 = mkChar(pickNoiseUser(oldUser), { world: 2, name: 'ミルク', job: '僧侶', level: 52, created: '2025-05-20 10:11:12' });
    K.milkW3 = mkChar(pickNoiseUser(oldUser), { world: 3, name: 'ミルク', job: '弓使い', level: 88, created: '2025-03-03 13:33:00' });
    K.milkOldDel = mkChar(pickNoiseUser(oldUser), { world: 1, name: 'ミルク', job: '剣士', level: 20, created: '2024-08-10 12:00:00', deleted: '2025-02-14 14:20:00' });
    K.kiraOwner = pickNoiseUser(oldUser);

    // noise chars
    for (const u of noiseUsers) {
      if (u === S.c6f) continue;
      const n = int(1, 3);
      for (let i = 0; i < n; i++) {
        const world = int(1, 3);
        const createdT = int(u.createdT + 300, Math.max(u.createdT + 600, Math.min(T1 - 86400 * 3, u.createdT + 86400 * 200)));
        const del = chance(0.06);
        const deletedT = del ? int(Math.max(createdT + 86400, T0 - 86400 * 60), T1 - 3600) : null;
        mkChar(u, { world, name: freshName(world), created: fmt(createdT), deleted: deletedT && deletedT > createdT ? fmt(deletedT) : null });
      }
    }
    chars.sort((a, b) => a.createdT - b.createdT);
    chars.forEach((c, i) => { c.id = i + 1; });

    // ---------------- logs ----------------
    const L = { login: [], charlog: [], item: [], cur: [], pay: [], err: [] };
    let seq = 0;
    const push = (tbl, t, row, key) => { const r = Object.assign({ _t: t, _s: seq++ }, row); if (key) r._key = key; L[tbl].push(r); return r; };
    const ipOf = (u) => pick(u.ips);
    const devOf = (u) => u.devices.length > 1 && chance(0.3) ? u.devices[1] : u.devices[0];
    const login = (u, t, result = 'SUCCESS', ip, dev, country, key) => push('login', t, { user_id: u.id, result, ip_address: ip || ipOf(u), country: country || u.country, device_id: dev || devOf(u) }, key);
    const charlog = (c, t, action, detail, ip, dev, key) => push('charlog', t, { user_id: c.user.id, character_id: c.id, action, detail: detail ? JSON.stringify(detail) : null, ip_address: ip || c.user.ips[0], device_id: dev || c.user.devices[0] }, key);
    const itemlog = (u, c, t, itemId, action, qty, o, key) => push('item', t, Object.assign({ user_id: u.id, character_id: c ? c.id : null, item_id: itemId, item_uid: null, action, quantity: qty, target_user_id: null, detail: null }, o || {}), key);
    const cur = (u, t, currency, amount, reason, ref, key) => push('cur', t, { user_id: u.id, currency, amount, reason, ref_id: ref || null }, key);
    const err = (t, level, service, message, userId, key) => push('err', t, { level, service, message, user_id: userId || null }, key);

    const usedUid = new Set(['EQ-7781-3302']);
    const newUid = () => { let s; do { s = `EQ-${int(1000, 9999)}-${int(1000, 9999)}`; } while (usedUid.has(s)); usedUid.add(s); return s; };
    const usedTx = new Set();
    const newTx = (store) => {
      let s;
      do {
        if (store === 'GooglePlay') s = `GPA.${int(3300, 3399)}-${String(int(0, 9999)).padStart(4, '0')}-${String(int(0, 9999)).padStart(4, '0')}-${String(int(0, 99999)).padStart(5, '0')}`;
        else if (store === 'AppStore') s = `2000000${int(100000000, 999999999)}`;
        else s = `WS-${hex4()}${hex4()}${hex4()}`.slice(0, 15);
      } while (usedTx.has(s));
      usedTx.add(s); return s;
    };
    const storeOf = (u) => ({ iOS: 'AppStore', Android: 'GooglePlay', PC: 'WebShop' }[u.platform]);

    // CREATE / DELETE logs for every character
    for (const c of chars) {
      c.createRow = charlog(c, c.createdT, 'CREATE', { name: c.name, world_id: c.createdWorld || c.world, job: c.job });
      if (c.deletedT && c !== K.sylphy) charlog(c, c.deletedT, 'DELETE', { name: c.name, level: c.level, confirm: 'name_input' });
    }
    // a few noise renames / transfers / delete+restore
    const noiseChars = chars.filter((c) => c.user.noise && !c.deletedT && c.createdT < T0 && !RESERVED.has(c.name));
    for (let i = 0; i < 6; i++) {
      const c = pick(noiseChars); const t = int(T0, T1 - 7200);
      const from = freshName(c.world);
      charlog(c, t, 'RENAME', { from, to: c.name }, ipOf(c.user), devOf(c.user));
      c.createRow.detail = JSON.stringify(Object.assign(JSON.parse(c.createRow.detail), { name: from }));
      itemlog(c.user, c, t - 2, 1202, 'USE', 1);
    }
    for (let i = 0; i < 3; i++) {
      const c = pick(noiseChars); const t = int(T0, T1 - 7200);
      const fromW = c.world === 1 ? 2 : 1;
      charlog(c, t, 'WORLD_TRANSFER', { from_world: fromW, to_world: c.world }, ipOf(c.user), devOf(c.user));
      c.createRow.detail = JSON.stringify(Object.assign(JSON.parse(c.createRow.detail), { world_id: fromW }));
      itemlog(c.user, c, t - 2, 1201, 'USE', 1);
    }
    for (let i = 0; i < 3; i++) {
      const c = pick(noiseChars); const t = int(T0, T1 - 86400 * 2);
      charlog(c, t, 'DELETE', { name: c.name, level: c.level, confirm: 'name_input' }, ipOf(c.user), devOf(c.user));
      charlog(c, t + int(3600 * 5, 86400 * 2), 'RESTORE', { name: c.name, by: 'cs_ticket' }, null, null);
    }

    // per-user inventory of equipment
    const EQUIPS = ITEMS.filter((i) => ['武器', '防具', 'アクセサリ'].includes(i[2]) && i[0] < 5000).map((i) => i[0]);
    const inv = new Map();
    for (const u of noiseUsers) inv.set(u, Array.from({ length: int(2, 4) }, () => ({ uid: newUid(), item: pick(EQUIPS), lvl: int(0, 6) })));
    for (const k of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7old']) inv.set(S[k], Array.from({ length: 3 }, () => ({ uid: newUid(), item: pick(EQUIPS), lvl: int(0, 5) })));
    // ログ期間の前から持っていた装備（usr_equips の組み立てに使う。乱数は使わない）
    const invInitial = new Map([...inv].map(([u, arr]) => [u, arr.map((e) => Object.assign({}, e))]));

    const blocked = (u, t) => u.blackout.some(([a, b]) => t >= toT(a) && t <= toT(b));
    const liveCharAt = (u, t) => { const cs = u.chars.filter((c) => c.createdT < t && (!c.deletedT || c.deletedT > t)); return cs.length ? pick(cs) : null; };
    const CONSUMABLE = [1001, 1001, 1002, 1003, 1004, 1101, 1101, 1102];
    const MATERIAL = [1301, 1302, 1303, 1101];
    const HOURS = [22, 23, 23, 3, 4, 10, 11, 11, 12, 12, 13, 13, 14, 15];

    function noiseSession(u, start) {
      const c = liveCharAt(u, start); if (!c) return;
      const ip = ipOf(u), dev = devOf(u);
      if (chance(0.03)) login(u, start - int(20, 90), 'FAILED', ip, dev);
      login(u, start, 'SUCCESS', ip, dev);
      const n = int(1, 7);
      let t = start + int(30, 300);
      const myInv = inv.get(u) || [];
      for (let i = 0; i < n; i++) {
        t += int(40, 900);
        if (t > T1) break;
        const r = rnd();
        if (r < 0.22) {
          const it = chance(0.6) ? pick(MATERIAL) : pick(CONSUMABLE);
          itemlog(u, c, t, it, 'GET', int(1, 8), { detail: JSON.stringify({ source: pick(['クエスト報酬', 'モンスタードロップ', 'ログインボーナス', 'デイリーミッション']) }) });
          cur(u, t + 1, 'GOLD', int(5, 80) * 1000, 'QUEST_REWARD', null);
        } else if (r < 0.36) {
          itemlog(u, c, t, pick(CONSUMABLE), 'USE', int(1, 3));
        } else if (r < 0.46) {
          cur(u, t, 'GOLD', -int(1, 50) * 1000, 'SHOP_BUY', `shop:${int(1, 12)}`);
          itemlog(u, c, t, pick(CONSUMABLE), 'GET', int(1, 10), { detail: JSON.stringify({ source: 'NPCショップ' }) });
        } else if (r < 0.56 && myInv.length) {
          const e = pick(myInv);
          const protect = e.lvl >= 6 && chance(0.6);
          if (protect) itemlog(u, c, t - 2, 1103, 'USE', 1);
          const rr = rnd();
          cur(u, t + 1, 'GOLD', -(e.lvl + 1) * 20000, 'ENHANCE_COST', e.uid);
          if (rr < 0.68) { itemlog(u, c, t, e.item, 'ENHANCE_SUCCESS', 1, { item_uid: e.uid, detail: JSON.stringify({ from: e.lvl, to: e.lvl + 1, protect }) }); e.lvl++; }
          else if (rr < 0.95 || protect || e.lvl < 7) itemlog(u, c, t, e.item, 'ENHANCE_FAIL', 1, { item_uid: e.uid, detail: JSON.stringify({ from: e.lvl, to: e.lvl, protect }) });
          else { itemlog(u, c, t, e.item, 'ENHANCE_DESTROY', 1, { item_uid: e.uid, detail: JSON.stringify({ from: e.lvl, to: null, protect }) }); myInv.splice(myInv.indexOf(e), 1); }
        } else if (r < 0.63 && myInv.length > 1) {
          const e = myInv.splice(int(0, myInv.length - 1), 1)[0];
          itemlog(u, c, t, e.item, 'SELL', 1, { item_uid: e.uid });
          cur(u, t + 1, 'GOLD', int(2, 40) * 1000, 'SELL_ITEM', e.uid);
        } else if (r < 0.68) {
          const e = { uid: newUid(), item: pick(EQUIPS), lvl: 0 }; myInv.push(e);
          itemlog(u, c, t, e.item, 'GET', 1, { item_uid: e.uid, detail: JSON.stringify({ source: pick(['ダンジョン宝箱', 'モンスタードロップ', 'クラフト']) }) });
        } else if (r < 0.74 && myInv.length) {
          const e = pick(myInv);
          itemlog(u, c, t, e.item, 'STORAGE_IN', 1, { item_uid: e.uid });
          if (chance(0.5) && t + 600 < T1 - 60) itemlog(u, c, Math.min(t + int(600, 86400), T1 - 60), e.item, 'STORAGE_OUT', 1, { item_uid: e.uid });
        } else if (r < 0.79 && !u.noTrades) {
          const v = pickNoiseUser((x) => x !== u && !x.noTrades && x.chars.some((cc) => !cc.deletedT));
          const vc = liveCharAt(v, t); if (!vc) continue;
          const it = pick([1002, 1003, 1004, 1301, 1302, 1303]);
          const q = int(1, 20);
          itemlog(u, c, t, it, 'TRADE_OUT', q, { target_user_id: v.id, detail: JSON.stringify({ to_character_id: vc.id }) });
          itemlog(v, vc, t, it, 'TRADE_IN', q, { target_user_id: u.id, detail: JSON.stringify({ from_character_id: c.id }) });
        } else if (r < 0.88) {
          cur(u, t, 'GEM', -pick([150, 300, 300, 3000]), 'GACHA', `gacha:${pick(['2026_autumn', 'standard', 'halloween'])}`);
        } else if (r < 0.95) {
          const amt = u.noBigGold ? int(1, 5) * 10000 : int(1, 10) * 10000;
          cur(u, t, 'GOLD', -amt, 'GUILD_DONATE', `guild:${int(100, 140)}`);
        } else {
          if (u.noBigGold) continue;
          if (chance(0.5)) cur(u, t, 'GOLD', -int(10, 150) * 10000, 'AUCTION_BUY', `auction:${int(80000, 99999)}`);
          else cur(u, t, 'GOLD', int(10, 120) * 10000, 'AUCTION_SELL', `auction:${int(80000, 99999)}`);
        }
      }
      // mount expiry (rare)
      if (chance(0.01)) itemlog(u, c, start + int(10, 50000), pick([3001, 3002]), 'EXPIRE', 1);
    }

    function purchase(u, t, productId, status, txFixed, opts) {
      const p = productById[productId];
      const store = storeOf(u);
      const tx = txFixed || newTx(store);
      if (txFixed) usedTx.add(txFixed);
      const pay = push('pay', t, { user_id: u.id, product_id: productId, price_jpy: p[2], store, transaction_id: tx, status }, opts && opts.key);
      if (status === 'SUCCESS' && !(opts && opts.noGrant)) {
        cur(u, t + int(1, 2), 'GEM', p[3], 'PURCHASE', tx, opts && opts.grantKey);
        if (chance(0.06)) err(t + 1, 'WARN', 'GemGrantService', () => `grant retry (attempt 2/3) payment_id=${pay.id}`, u.id);
      }
      return pay;
    }

    // noise activity
    for (const u of users) {
      if (u.scriptedOnly) continue;
      const from = Math.max(T0, u.createdT + 600, u.activeFrom ? toT(u.activeFrom) : 0);
      const until = Math.min(T1, u.activeUntil ? toT(u.activeUntil) : T1);
      for (let day = Math.floor(from / 86400) * 86400; day < until; day += 86400) {
        if (!chance(u.activity)) continue;
        const sessions = chance(0.35) ? 2 : 1;
        for (let s = 0; s < sessions; s++) {
          const h = pick(HOURS);
          const t = day + h * 3600 + int(0, 3599);
          if (t < from || t > until - 3600 || blocked(u, t) || blocked(u, t + 7200)) continue;
          noiseSession(u, t);
        }
      }
      if (!u.noPayments && chance(0.33)) {
        const n = int(1, 3);
        for (let i = 0; i < n; i++) {
          const t = int(from, until - 600); if (blocked(u, t)) continue;
          const st = chance(0.88) ? 'SUCCESS' : 'CANCELED';
          purchase(u, t, pick(PRODUCTS)[0], st);
        }
      }
    }

    // noise error logs
    const ERRS = [
      ['WARN', 'GameAPI', () => `slow request: POST /api/v2/battle/result took ${int(1200, 4800)}ms`],
      ['WARN', 'GameAPI', () => `rate limit exceeded: /api/v2/gacha/draw (ip=${randIp('JP')})`],
      ['ERROR', 'GameAPI', () => 'upstream timeout: matchmaking-svc (30000ms)'],
      ['WARN', 'MySQL', () => `slow query detected (${(int(20, 90) / 10).toFixed(1)}s): SELECT ... FROM log_item WHERE ...`],
      ['ERROR', 'Redis', () => 'connection reset by peer (ranking-cache-02)'],
      ['WARN', 'ChatService', () => `message rejected by NG word filter (len=${int(5, 80)})`],
      ['ERROR', 'AuctionService', () => `bid conflict, rolled back (auction:${int(80000, 99999)})`],
      ['WARN', 'Batch', () => 'daily_ranking_aggregate finished with 3 retries'],
      ['ERROR', 'PushService', () => `APNs responded 410 Unregistered (${int(1, 40)} tokens)`],
    ];
    for (let i = 0; i < 220; i++) {
      const [lv, svc, f] = pick(ERRS);
      const withUser = svc === 'GameAPI' && chance(0.4);
      err(int(T0, T1), lv, svc, f(), withUser ? pickNoiseUser().id : null);
    }

    // ================= scripted cases =================
    const T = toT;
    const KEY = {};

    // ---- case 1: シルフィ削除（本人） ----
    login(S.c1, T('2026-11-03 12:31:05'), 'SUCCESS', '126.204.33.17', 'iPhone15,2-7F3A');
    itemlog(S.c1, K.sylphy, T('2026-11-03 12:33:40'), 1001, 'USE', 2);
    itemlog(S.c1, K.sylphy, T('2026-11-03 12:39:02'), 1004, 'TRADE_OUT', 3, { target_user_id: S.c6f.id, detail: JSON.stringify({ to_character_id: K.popolon.id }) });
    itemlog(S.c6f, K.popolon, T('2026-11-03 12:39:02'), 1004, 'TRADE_IN', 3, { target_user_id: S.c1.id, detail: JSON.stringify({ from_character_id: K.sylphy.id }) });
    charlog(K.sylphy, T('2026-11-03 12:42:18'), 'DELETE', { name: 'シルフィ', level: 87, confirm: 'name_input' }, '126.204.33.17', 'iPhone15,2-7F3A', 'c1_delete');

    // ---- case 2: 煌星の大剣（強化で消滅） ----
    const kira = 'EQ-7781-3302';
    const c2steps = [
      ['2026-10-28 14:22:10', 'GET', { source: 'レイド:星喰いの竜' }],
      ['2026-10-29 12:01:33', 'ENHANCE_SUCCESS', { from: 0, to: 1, protect: false }],
      ['2026-10-29 12:02:10', 'ENHANCE_SUCCESS', { from: 1, to: 2, protect: false }],
      ['2026-10-30 13:15:42', 'ENHANCE_SUCCESS', { from: 2, to: 3, protect: false }],
      ['2026-10-31 11:40:05', 'ENHANCE_SUCCESS', { from: 3, to: 4, protect: false }],
      ['2026-11-02 12:20:18', 'ENHANCE_FAIL', { from: 4, to: 4, protect: false }],
      ['2026-11-02 12:21:02', 'ENHANCE_SUCCESS', { from: 4, to: 5, protect: false }],
      ['2026-11-04 13:05:51', 'ENHANCE_SUCCESS', { from: 5, to: 6, protect: false }],
      ['2026-11-06 12:44:30', 'ENHANCE_FAIL', { from: 6, to: 6, protect: true }],
      ['2026-11-06 12:45:12', 'ENHANCE_SUCCESS', { from: 6, to: 7, protect: true }],
      ['2026-11-08 14:10:09', 'ENHANCE_SUCCESS', { from: 7, to: 8, protect: true }],
      ['2026-11-10 12:30:00', 'STORAGE_IN', null],
      ['2026-11-11 13:01:12', 'STORAGE_OUT', null],
      ['2026-11-11 13:03:40', 'ENHANCE_SUCCESS', { from: 8, to: 9, protect: false }],
      ['2026-11-11 13:05:41', 'ENHANCE_DESTROY', { from: 9, to: null, protect: false }],
    ];
    const loggedDays = new Set();
    for (const [ts, action, d] of c2steps) {
      const t = T(ts);
      const day = ts.slice(0, 10);
      if (!loggedDays.has(day)) { loggedDays.add(day); login(S.c2, t - int(180, 900), 'SUCCESS', '219.110.5.88', 'PC-WIN-4D10'); }
      if (d && d.protect) itemlog(S.c2, K.wolf, t - 2, 1103, 'USE', 1);
      if (action.startsWith('ENHANCE')) cur(S.c2, t + 1, 'GOLD', -((d.from + 1) * 20000), 'ENHANCE_COST', kira);
      itemlog(S.c2, K.wolf, t, 5012, action, 1, { item_uid: kira, detail: d ? JSON.stringify(d) : null }, action === 'ENHANCE_DESTROY' ? 'c2_destroy' : null);
    }
    // 別ユーザーの煌星の大剣（おとり）
    {
      const u = K.kiraOwner; const c = u.chars.find((x) => !x.deletedT) || u.chars[0]; const uid = newUid();
      itemlog(u, c, T('2026-10-25 11:42:31'), 5012, 'GET', 1, { item_uid: uid, detail: JSON.stringify({ source: 'レイド:星喰いの竜' }) });
      itemlog(u, c, T('2026-11-11 12:58:20'), 5012, 'STORAGE_IN', 1, { item_uid: uid });
      itemlog(u, c, T('2026-11-11 13:20:05'), 5012, 'ENHANCE_FAIL', 1, { item_uid: uid, detail: JSON.stringify({ from: 3, to: 3, protect: false }) });
    }

    // ---- case 3: ゴールド減少（JST 11/8 07:47 ログイン → 07:51 寄付） ----
    login(S.c3, T('2026-11-07 22:47:10'), 'SUCCESS', '153.240.17.62', 'SH-M26-91B4');
    cur(S.c3, T('2026-11-07 22:48:31'), 'GOLD', 12000, 'QUEST_REWARD', null);
    cur(S.c3, T('2026-11-07 22:51:37'), 'GOLD', -4800000, 'GUILD_DONATE', 'guild:118', 'c3_donate');
    itemlog(S.c3, K.hayate, T('2026-11-07 22:55:02'), 1001, 'USE', 1);
    login(S.c3, T('2026-11-08 11:20:44'), 'SUCCESS', '153.240.17.62', 'SH-M26-91B4');
    cur(S.c3, T('2026-11-08 11:31:05'), 'GOLD', -10000, 'GUILD_DONATE', 'guild:118');
    cur(S.c3, T('2026-11-08 11:40:22'), 'GOLD', -35000, 'SHOP_BUY', 'shop:4');
    cur(S.c3, T('2026-11-08 11:52:47'), 'GOLD', 22000, 'QUEST_REWARD', null);

    // ---- case 4: ワールド移動 ----
    login(S.c4, T('2026-11-09 10:05:18'), 'SUCCESS', '180.17.230.4', 'iPhone14,5-0C2E');
    itemlog(S.c4, K.shikkoku, T('2026-11-09 10:12:50'), 1201, 'GET', 1, { detail: JSON.stringify({ source: 'ジェムショップ' }) });
    cur(S.c4, T('2026-11-09 10:12:50'), 'GEM', -1200, 'SHOP_BUY', 'gemshop:world_transfer');
    itemlog(S.c4, K.shikkoku, T('2026-11-09 10:14:20'), 1201, 'USE', 1);
    charlog(K.shikkoku, T('2026-11-09 10:14:22'), 'WORLD_TRANSFER', { from_world: 1, to_world: 3 }, '180.17.230.4', 'iPhone14,5-0C2E', 'c4_transfer');

    // ---- case 5: 課金未反映（本物の不具合） ----
    login(S.c5, T('2026-11-05 09:58:40'), 'SUCCESS', '111.239.160.33', 'Pixel8-5E21');
    purchase(S.c5, T('2026-11-05 10:02:11'), 'gem_pack_980', 'SUCCESS', 'GPA.3391-0042-1150-20871');
    cur(S.c5, T('2026-11-05 10:04:30'), 'GEM', -300, 'GACHA', 'gacha:2026_autumn');
    login(S.c5, T('2026-11-10 11:15:02'), 'SUCCESS', '111.239.160.33', 'Pixel8-5E21');
    purchase(S.c5, T('2026-11-10 11:18:40'), 'gem_pack_3000', 'CANCELED', 'GPA.3391-0042-7781-48820');
    const c5pay = purchase(S.c5, T('2026-11-10 11:20:03'), 'gem_pack_3000', 'SUCCESS', 'GPA.3391-0042-7781-55102', { noGrant: true, key: 'c5_pay' });
    err(T('2026-11-10 11:20:04'), 'WARN', 'GemGrantService', () => `grant retry (attempt 2/3) payment_id=${c5pay.id}`, S.c5.id);
    err(T('2026-11-10 11:20:05'), 'WARN', 'GemGrantService', () => `grant retry (attempt 3/3) payment_id=${c5pay.id}`, S.c5.id);
    err(T('2026-11-10 11:20:06'), 'ERROR', 'GemGrantService', () => `grant aborted: Deadlock found when trying to get lock; try restarting transaction (payment_id=${c5pay.id})`, S.c5.id, 'c5_err');

    // ---- case 6: 乗っ取り ----
    const V = S.c6, X = S.c6x, F = S.c6f;
    const vUid = {};
    for (const [ts, id, src] of [['2026-10-22 12:40:10', 5020, 'レイド:天空の覇者'], ['2026-10-25 13:10:44', 5031, 'レイド:竜王の巣'], ['2026-11-01 11:55:02', 5040, 'イベント報酬'], ['2026-11-02 12:30:30', 1004, 'イベント報酬']]) {
      vUid[id] = id === 1004 ? null : newUid();
      itemlog(V, K.luna, T(ts), id, 'GET', id === 1004 ? 30 : 1, { item_uid: vUid[id], detail: JSON.stringify({ source: src }) });
    }
    login(V, T('2026-11-08 12:10:07'), 'SUCCESS', '60.112.45.201', 'SM-S918-2B71');
    itemlog(V, K.luna, T('2026-11-08 12:22:31'), 1002, 'TRADE_OUT', 20, { target_user_id: F.id, detail: JSON.stringify({ to_character_id: K.popolon.id }) });
    itemlog(F, K.popolon, T('2026-11-08 12:22:31'), 1002, 'TRADE_IN', 20, { target_user_id: V.id, detail: JSON.stringify({ from_character_id: K.luna.id }) });
    login(X, T('2026-11-10 16:45:30'), 'SUCCESS', '185.220.101.47', 'PC-WIN-9C4E', 'NL');
    login(X, T('2026-11-11 21:12:09'), 'SUCCESS', '185.220.101.47', 'PC-WIN-9C4E', 'NL');
    for (const ts of ['2026-11-12 03:02:11', '2026-11-12 03:03:40', '2026-11-12 03:05:02', '2026-11-12 03:06:55', '2026-11-12 03:08:30']) {
      login(V, T(ts), 'FAILED', '185.220.101.47', 'PC-WIN-9C4E', 'NL');
    }
    login(V, T('2026-11-12 03:10:33'), 'SUCCESS', '185.220.101.47', 'PC-WIN-9C4E', 'NL', 'c6_login');
    login(X, T('2026-11-12 03:12:50'), 'SUCCESS', '185.220.101.47', 'PC-WIN-9C4E', 'NL');
    const loot = [['2026-11-12 03:14:05', 5020, 1], ['2026-11-12 03:15:40', 5031, 1], ['2026-11-12 03:16:22', 5040, 1], ['2026-11-12 03:18:09', 1004, 30]];
    for (const [ts, id, q] of loot) {
      itemlog(V, K.luna, T(ts), id, 'TRADE_OUT', q, { item_uid: vUid[id], target_user_id: X.id, detail: JSON.stringify({ to_character_id: K.kageroh.id }) });
      itemlog(X, K.kageroh, T(ts), id, 'TRADE_IN', q, { item_uid: vUid[id], target_user_id: V.id, detail: JSON.stringify({ from_character_id: K.luna.id }) });
    }
    cur(X, T('2026-11-12 03:25:10'), 'GOLD', 1500000, 'AUCTION_SELL', 'auction:91822');
    login(V, T('2026-11-13 00:35:12'), 'SUCCESS', '60.112.45.201', 'SM-S918-2B71');

    // ---- case 7: 機種変更で別アカウント ----
    login(S.c7old, T('2026-11-11 23:05:40'), 'SUCCESS', '49.98.140.77', 'SO-51D-33E8');
    itemlog(S.c7old, K.milk, T('2026-11-11 23:09:12'), 1002, 'USE', 1);
    login(S.c7, T('2026-11-12 11:02:40'), 'SUCCESS', '114.150.82.9', 'iPhone16,1-A9D0');
    itemlog(S.c7, K.milkNew, T('2026-11-12 11:15:30'), 1001, 'GET', 5, { detail: JSON.stringify({ source: 'チュートリアル報酬' }) });
    login(S.c7, T('2026-11-12 13:41:09'), 'SUCCESS', '114.150.82.9', 'iPhone16,1-A9D0');
    login(S.c7, T('2026-11-12 23:48:55'), 'SUCCESS', '114.150.82.9', 'iPhone16,1-A9D0');

    // ================= 追加テーブル（装備・ガチャ・ステージ・ランキング・プレゼント） =================
    // ここまでのデータ（と問題の答え）を変えないよう、ここからは別の乱数列を使う
    const rnd2 = mulberry32((seed || 20261113) + 7);
    const int2 = (a, b) => a + Math.floor(rnd2() * (b - a + 1));
    const pick2 = (a) => a[Math.floor(rnd2() * a.length)];
    const chance2 = (p) => rnd2() < p;
    const TJ = (s) => toT(s) - JST_OFFSET; // JST の文字列 → 内部の UTC 秒
    const uById = new Map(users.map((u) => [u.id, u]));
    const liveChar2 = (u, t) => { const cs = u.chars.filter((c) => c.createdT < t && (!c.deletedT || c.deletedT > t)); return cs.length ? cs[Math.floor(rnd2() * cs.length)] : null; };
    const newUid2 = () => { let s; do { s = `EQ-${int2(1000, 9999)}-${int2(1000, 9999)}`; } while (usedUid.has(s)); usedUid.add(s); return s; };
    const itemName = Object.fromEntries(ITEMS.map((i) => [i[0], i[1]]));

    // --- 装備のログを log_item から log_equip に分ける
    L.equip = L.item.filter((r) => EQUIP_IDS.has(r.item_id));
    L.item = L.item.filter((r) => !EQUIP_IDS.has(r.item_id));
    L.gacha = []; L.stage = [];

    // --- ガチャ：既存の GACHA（ジェム消費）1件ごとに、引いた結果を記録する
    //     150 = 初回限定の半額1回、300 = 1回、3000 = 10連。期間外のガチャIDは期間内のものに直す
    const lineupOf = (gid) => LINEUPS.filter((l) => l[1] === gid);
    const draw = (gid) => { const ls = lineupOf(gid); let x = int2(1, 1000); for (const l of ls) { x -= l[5]; if (x <= 0) return l; } return ls[0]; };
    for (const r of L.cur) {
      if (r.reason !== 'GACHA') continue;
      let gid = String(r.ref_id || '').replace('gacha:', '') || 'standard';
      if (gid === 'halloween' && r._t > TJ('2026-10-31 23:59:59')) gid = chance2(0.6) ? '2026_autumn' : 'standard';
      if (gid === '2026_autumn' && r._t < TJ('2026-11-01 12:00:00')) gid = chance2(0.6) ? 'halloween' : 'standard';
      r.ref_id = `gacha:${gid}`;
      const u = uById.get(r.user_id);
      const n = r.amount <= -3000 ? 10 : 1;
      const c = liveChar2(u, r._t);
      for (let k = 0; k < n; k++) {
        const l = draw(gid);
        push('gacha', r._t, { user_id: u.id, gacha_id: gid, curRow: r, reward_type: l[2], reward_id: l[3], rarity: l[4] });
        const src = JSON.stringify({ source: `ガチャ:${GACHAS.find((g) => g[0] === gid)[1]}` });
        if (l[2] === 'EQUIP') push('equip', r._t, { user_id: u.id, character_id: c ? c.id : null, item_id: l[3], item_uid: newUid2(), action: 'GET', quantity: 1, target_user_id: null, detail: src });
        else push('item', r._t, { user_id: u.id, character_id: c ? c.id : null, item_id: l[3], item_uid: null, action: 'GET', quantity: 1, target_user_id: null, detail: src });
      }
    }

    // --- ユーザーごと・ガチャごとの回数（usr_gachas）と天井ポイント（usr_gacha_ceilings）：log_gacha から数える
    //     交換はプレイヤーが好きなときに行う。天井（100 / 200回）まで回した人はまだいないので、ポイント = 回した回数、交換回数は 0
    const UG = new Map();
    for (const r of [...L.gacha].sort((a, b) => a._t - b._t || a._s - b._s)) {
      const k = `${r.user_id}:${r.gacha_id}`;
      if (!UG.has(k)) UG.set(k, { user_id: r.user_id, gacha_id: r.gacha_id, draws: 0, point: 0, exchanged: 0, first: r._t, last: r._t });
      const g = UG.get(k);
      g.draws++; g.point++; g.last = r._t;
    }

    // --- ステージ：クエスト報酬（QUEST_REWARD）の直前にクリア記録。イベント期間は特設ステージも遊ぶ
    const stageById = Object.fromEntries(STAGES.map((s) => [s[0], s]));
    const normal = STAGES.filter((s) => s[3] === 'NORMAL');
    const within = (t, a, b) => t >= TJ(a) && t <= TJ(b);
    const stageFor = (lv, t) => {
      if (within(t, '2026-10-15 12:00:00', '2026-10-31 23:59:59') && chance2(0.3)) return stageById[801];
      if (within(t, '2026-11-01 12:00:00', '2026-11-15 23:59:59') && chance2(0.3)) return stageById[802];
      const ok = normal.filter((s) => s[5] <= lv + 3);
      return ok.length ? pick2(ok.slice(-4)) : normal[0];
    };
    for (const r of L.cur) {
      if (r.reason !== 'QUEST_REWARD') continue;
      const u = uById.get(r.user_id), c = liveChar2(u, r._t);
      const st = stageFor(c ? c.level : 30, r._t);
      if (chance2(0.15)) push('stage', r._t - int2(300, 900), { user_id: u.id, character_id: c ? c.id : null, stage_id: st[0], result: 'FAILED', score: int2(200, 3000), clear_time_sec: null });
      push('stage', r._t - int2(3, 40), { user_id: u.id, character_id: c ? c.id : null, stage_id: st[0], result: 'CLEAR', score: int2(3000, 30000), clear_time_sec: int2(60, 600) });
      r.ref_id = `stage:${st[0]}`;
    }
    // レイドで手に入れたアイテム・装備には、そのレイドのクリア記録を付ける
    const raidByName = Object.fromEntries(STAGES.filter((s) => s[3] === 'RAID').map((s) => [s[1], s]));
    for (const r of [...L.equip, ...L.item]) {
      const src = r.detail ? (JSON.parse(r.detail).source || '') : '';
      if (r.action === 'GET' && raidByName[src]) push('stage', r._t - int2(30, 120), { user_id: r.user_id, character_id: r.character_id, stage_id: raidByName[src][0], result: 'CLEAR', score: int2(800000, 2400000), clear_time_sec: int2(300, 1200) });
    }
    // 星喰いの竜 討伐戦：レベルの高いキャラを持つユーザーが挑む（与ダメージ = score）
    for (const u of noiseUsers) {
      const strong = u.chars.filter((c) => !c.deletedT && c.level >= 60);
      if (!strong.length || !chance2(0.55)) continue;
      const n = int2(1, 8);
      for (let k = 0; k < n; k++) {
        const t = int2(Math.max(T0, TJ('2026-10-25 12:00:00')), TJ('2026-11-08 23:59:59'));
        const c = pick2(strong), win = chance2(0.7);
        push('stage', t, { user_id: u.id, character_id: c.id, stage_id: 901, result: win ? 'CLEAR' : 'FAILED', score: win ? int2(300000, 2600000) : int2(20000, 300000), clear_time_sec: win ? int2(300, 1500) : null });
      }
    }

    // --- ランキング：星喰いの竜（与ダメージの合計）と、ギルド貢献（寄付ゴールドの合計）
    const RANK = [];
    const rankUp = (eventId, rows) => {
      const sum = new Map();
      for (const [uid, v, t] of rows) { const s = sum.get(uid) || { v: 0, t: 0 }; s.v += v; s.t = Math.max(s.t, t); sum.set(uid, s); }
      [...sum.entries()].sort((a, b) => b[1].v - a[1].v || a[0] - b[0]).forEach(([uid, s], i) => RANK.push({ event_id: eventId, user_id: uid, score: s.v, rank: i + 1, _t: s.t }));
    };
    rankUp('ev_raid_star', L.stage.filter((r) => r.stage_id === 901 && r.result === 'CLEAR' && within(r._t, '2026-10-25 12:00:00', '2026-11-08 23:59:59')).map((r) => [r.user_id, r.score, r._t]));
    rankUp('ev_guild', L.cur.filter((r) => r.reason === 'GUILD_DONATE' && within(r._t, '2026-11-01 00:00:00', '2026-11-14 23:59:59')).map((r) => [r.user_id, -r.amount, r._t]));

    // --- プレゼントBOX：ログインボーナス、メンテナンスのお詫び、討伐戦の順位報酬
    //     受け取りはそのユーザーのログインのついで。ジェムは log_currency に PRESENT、アイテムは log_item に GET
    const loginsOf = new Map();
    for (const r of L.login) if (r.result === 'SUCCESS') { if (!loginsOf.has(r.user_id)) loginsOf.set(r.user_id, []); loginsOf.get(r.user_id).push(r._t); }
    const nextLoginAfter = (uid, t, within2) => { const ls = loginsOf.get(uid) || []; const x = ls.find((v) => v > t && v - t <= within2); return x == null ? null : x + int2(5, 300); };
    const PRES = [];
    const DAY = 86400, nov1 = TJ('2026-11-01 00:00:00');
    for (const [uid, ls] of loginsOf) {
      const seenDay = new Set();
      for (const t of ls) {
        const d = Math.floor((t - nov1) / DAY) + 1;
        if (d < 1 || seenDay.has(d)) continue;
        seenDay.add(d);
        const gift = d % 7 === 0 ? ['GEM', null, 50] : d % 3 === 0 ? ['ITEM', 1101, 5] : ['ITEM', 1001, 3];
        PRES.push({ user_id: uid, type: gift[0], reward_id: gift[1], qty: gift[2], title: `11月ログインボーナス ${d}日目`, source: 'LOGIN_BONUS', _t: t + 1, exp: t + 30 * DAY, recv: chance2(0.85) ? t + int2(10, 600) : null });
      }
    }
    const maint = TJ('2026-11-06 16:00:00');
    for (const u of users) {
      if (u.status !== 'ACTIVE' || u.scriptedOnly || u.createdT > maint) continue;
      PRES.push({ user_id: u.id, type: 'GEM', reward_id: null, qty: 300, title: '11/6 臨時メンテナンスのお詫び', source: 'MAINTENANCE', _t: maint, exp: maint + 14 * DAY, recv: nextLoginAfter(u.id, maint, 7 * DAY) });
    }
    const raidEnd = TJ('2026-11-09 12:00:00');
    for (const r of RANK.filter((x) => x.event_id === 'ev_raid_star')) {
      const g = r.rank <= 3 ? ['GEM', null, 3000] : r.rank <= 10 ? ['GEM', null, 1000] : r.rank <= 30 ? ['GEM', null, 300] : ['ITEM', 1303, 1];
      PRES.push({ user_id: r.user_id, type: g[0], reward_id: g[1], qty: g[2], title: `星喰いの竜 討伐戦 ${r.rank}位 報酬`, source: 'EVENT', _t: raidEnd, exp: raidEnd + 30 * DAY, recv: nextLoginAfter(r.user_id, raidEnd, 4 * DAY) });
    }
    PRES.sort((a, b) => a._t - b._t || a.user_id - b.user_id);
    PRES.forEach((p, i) => {
      p.id = i + 1;
      if (p.recv != null && p.recv >= T1) p.recv = null;
      if (p.recv == null) return;
      if (p.type === 'GEM') cur(uById.get(p.user_id), p.recv, 'GEM', p.qty, 'PRESENT', `present:${p.id}`);
      else { const c = liveChar2(uById.get(p.user_id), p.recv); push('item', p.recv, { user_id: p.user_id, character_id: c ? c.id : null, item_id: p.reward_id, item_uid: null, action: 'GET', quantity: p.qty, target_user_id: null, detail: JSON.stringify({ source: 'プレゼントBOX', present_id: p.id }) }); }
    });

    // --- ミッション（usr_missions）：実際のログから進み具合を数える。デイリー・ウィークリーは今の周期だけを持つ
    //     受け取った報酬は、ジェムなら log_currency の MISSION、アイテムなら log_item の GET（source = ミッション報酬）
    const evOf = new Map(); // user_id → { 条件の種類: [[時刻, 増える量], ...] }
    const addEv = (uid, type, t, v) => { if (!evOf.has(uid)) evOf.set(uid, {}); const m = evOf.get(uid); (m[type] = m[type] || []).push([t, v]); };
    const loginDay = new Set();
    for (const r of [...L.login].sort((a, b) => a._t - b._t)) {
      if (r.result !== 'SUCCESS') continue;
      const k = `${r.user_id}:${Math.floor((r._t + JST_OFFSET) / DAY)}`;
      if (!loginDay.has(k)) { loginDay.add(k); addEv(r.user_id, 'LOGIN', r._t, 1); }
    }
    for (const r of L.stage) if (r.result === 'CLEAR') { addEv(r.user_id, 'STAGE_CLEAR', r._t, 1); if (stageById[r.stage_id][3] === 'RAID') addEv(r.user_id, 'RAID_CLEAR', r._t, 1); }
    for (const r of L.gacha) addEv(r.user_id, 'GACHA_DRAW', r._t, 1);
    for (const r of L.equip) if (r.action === 'ENHANCE_SUCCESS') addEv(r.user_id, 'ENHANCE_SUCCESS', r._t, 1);
    for (const r of L.cur) if (r.reason === 'GUILD_DONATE') addEv(r.user_id, 'GUILD_DONATE', r._t, -r.amount);
    for (const c of chars) addEv(c.user.id, 'CHARACTER_CREATE', c.createdT, 1);
    const evById = Object.fromEntries(EVENTS.map((e) => [e[0], e]));
    const periodOf = (m, u) => {
      if (m[2] === 'DAILY') return [TJ('2026-11-13 00:00:00'), T1];
      if (m[2] === 'WEEKLY') return [TJ('2026-11-09 00:00:00'), T1];
      if (m[2] === 'EVENT') { const e = evById[m[3]]; return [TJ(e[4]), Math.min(TJ(e[5]), T1)]; }
      if (m[2] === 'BEGINNER') return u.createdT >= TJ('2026-11-01 00:00:00') ? [u.createdT, T1] : null;
      return null;
    };
    const UM = [];
    for (const u of users) {
      for (const m of MISSIONS) {
        const p = periodOf(m, u); if (!p) continue;
        const evs = ((evOf.get(u.id) || {})[m[4]] || []).filter(([t]) => t >= p[0] && t <= p[1]).sort((a, b) => a[0] - b[0]);
        if (!evs.length) continue;
        let sum = 0, cleared = null;
        for (const [t, v] of evs) { sum += v; if (cleared == null && sum >= m[5]) cleared = t; }
        let recv = cleared != null && chance2(0.85) ? cleared + int2(5, 300) : null;
        if (recv != null && recv >= T1) recv = null;
        UM.push({ user_id: u.id, mission_id: m[0], progress: Math.min(sum, m[5]), cleared, recv, updated: Math.max(evs[evs.length - 1][0], recv || 0) });
        if (recv == null) continue;
        if (m[6] === 'GEM') cur(u, recv, 'GEM', m[8], 'MISSION', `mission:${m[0]}`);
        else { const c = liveChar2(u, recv); push('item', recv, { user_id: u.id, character_id: c ? c.id : null, item_id: m[7], item_uid: null, action: 'GET', quantity: m[8], target_user_id: null, detail: JSON.stringify({ source: 'ミッション報酬', mission_id: m[0] }) }); }
      }
    }

    // --- 今持っている装備（usr_equips）：期間前の手持ちに、log_equip を時系列で当てはめて組み立てる
    const owned = new Map();
    for (const [u, arr] of invInitial) {
      const c = u.chars.find((x) => !x.deletedT) || u.chars[0];
      for (const e of arr) owned.set(e.uid, { uid: e.uid, user_id: u.id, character_id: c ? c.id : null, equip_id: e.item, level: e.lvl, in_storage: 0, _t: int2(Math.max(u.createdT, T0 - DAY * 200), T0 - 3600) });
    }
    for (const r of [...L.equip].sort((a, b) => a._t - b._t || a._s - b._s)) {
      const d = r.detail ? JSON.parse(r.detail) : {};
      const o = owned.get(r.item_uid);
      if (r.action === 'GET') owned.set(r.item_uid, { uid: r.item_uid, user_id: r.user_id, character_id: r.character_id, equip_id: r.item_id, level: 0, in_storage: 0, _t: r._t });
      else if (!o) continue;
      else if (r.action === 'ENHANCE_SUCCESS') o.level = d.to;
      else if (r.action === 'ENHANCE_DESTROY' || r.action === 'SELL') owned.delete(r.item_uid);
      else if (r.action === 'STORAGE_IN') o.in_storage = 1;
      else if (r.action === 'STORAGE_OUT') o.in_storage = 0;
      else if (r.action === 'TRADE_IN') { o.user_id = r.user_id; o.character_id = r.character_id; o.in_storage = 0; }
    }

    // ================= finalize =================
    const order = (a, b) => a._t - b._t || a._s - b._s;
    for (const k of Object.keys(L)) {
      L[k].sort(order);
      L[k].forEach((r, i) => { r.id = i + 1; if (r._key) KEY[r._key] = r.id; });
    }
    // balances
    const bal = new Map();
    for (const r of L.cur) {
      const k = r.user_id + ':' + r.currency;
      if (!bal.has(k)) bal.set(k, []);
      bal.get(k).push(r);
    }
    const userById = new Map(users.map((u) => [u.id, u]));
    for (const [k, rows] of bal) {
      const u = userById.get(+k.split(':')[0]);
      const isGold = k.endsWith('GOLD');
      let s = 0, min = 0;
      for (const r of rows) { s += r.amount; min = Math.min(min, s); }
      let b = isGold ? (u.gold0 != null ? u.gold0 : int(2, 300) * 10000) : int(0, 4000);
      if (b + min < 0) b = -min + (isGold ? int(1, 20) * 1000 : int(0, 200));
      for (const r of rows) { b += r.amount; r.balance_after = b; }
    }

    return {
      schema: SCHEMA,
      worlds: [[1, 'アルファ'], [2, 'ベータ'], [3, 'ガンマ']],
      items: MST_ITEMS, products: PRODUCTS, equips: MST_EQUIPS,
      events: EVENTS, gachas: GACHAS, lineups: LINEUPS, stages: STAGES,
      // ここで JST に変換して書き出す
      users: users.map((u) => [u.id, u.pub, u.platform, u.status, toJ(u.created)]),
      characters: chars.map((c) => [c.id, c.user.id, c.world, c.name, c.job, c.level, toJ(c.created), toJ(c.deleted)]),
      login: L.login.map((r) => [r.id, r.user_id, r.result, r.ip_address, r.country, r.device_id, fmtJ(r._t)]),
      charlog: L.charlog.map((r) => [r.id, r.user_id, r.character_id, r.action, r.detail, r.ip_address, r.device_id, fmtJ(r._t)]),
      item: L.item.map((r) => [r.id, r.user_id, r.character_id, r.item_id, r.action, r.quantity, r.target_user_id, r.detail, fmtJ(r._t)]),
      equip: L.equip.map((r) => [r.id, r.user_id, r.character_id, r.item_id, r.item_uid, r.action, r.target_user_id, r.detail, fmtJ(r._t)]),
      usrEquips: [...owned.values()].sort((a, b) => a.user_id - b.user_id || a._t - b._t).map((o) => [o.uid, o.user_id, o.character_id, o.equip_id, o.level, o.in_storage, fmtJ(o._t)]),
      gacha: L.gacha.map((r) => [r.id, r.user_id, r.gacha_id, r.curRow.id, r.reward_type, r.reward_id, r.rarity, fmtJ(r._t)]),
      usrGachas: [...UG.values()].sort((a, b) => a.user_id - b.user_id || (a.gacha_id < b.gacha_id ? -1 : 1))
        .map((g) => [g.user_id, g.gacha_id, g.draws, fmtJ(g.first), fmtJ(g.last)]),
      usrCeilings: [...UG.values()].sort((a, b) => a.user_id - b.user_id || (a.gacha_id < b.gacha_id ? -1 : 1))
        .map((g) => [g.user_id, g.gacha_id, g.point, g.exchanged, fmtJ(g.last)]),
      ceilings: CEILINGS, missions: MISSIONS,
      usrMissions: UM.map((m) => [m.user_id, m.mission_id, m.progress, m.cleared == null ? null : fmtJ(m.cleared), m.recv == null ? null : fmtJ(m.recv), fmtJ(m.updated)]),
      stage: L.stage.map((r) => [r.id, r.user_id, r.character_id, r.stage_id, r.result, r.score, r.clear_time_sec, fmtJ(r._t)]),
      rankings: RANK.map((r) => [r.event_id, r.user_id, r.score, r.rank, fmtJ(r._t)]),
      presents: PRES.map((p) => [p.id, p.user_id, p.type, p.reward_id, p.qty, p.title, p.source, fmtJ(p._t), fmtJ(p.exp), p.recv == null ? null : fmtJ(p.recv)]),
      cur: L.cur.map((r) => [r.id, r.user_id, r.currency, r.amount, r.balance_after, r.reason, r.ref_id, fmtJ(r._t)]),
      pay: L.pay.map((r) => [r.id, r.user_id, r.product_id, r.price_jpy, r.store, r.transaction_id, r.status, fmtJ(r._t)]),
      err: L.err.map((r) => [r.id, r.level, r.service, typeof r.message === 'function' ? r.message() : r.message, r.user_id, fmtJ(r._t)]),
      keys: KEY,
    };
  }

  function buildDatabase(SQL, seed) {
    const g = generate(seed);
    const db = new SQL.Database();
    db.run(g.schema);
    db.run('BEGIN');
    const ins = (table, rows) => {
      if (!rows.length) return;
      const st = db.prepare(`INSERT INTO ${table} VALUES (${rows[0].map(() => '?').join(',')})`);
      for (const r of rows) st.run(r);
      st.free();
    };
    const data = {
      mst_worlds: g.worlds, mst_items: g.items, mst_products: g.products, mst_equips: g.equips,
      mst_events: g.events, mst_gachas: g.gachas, mst_gacha_lineups: g.lineups, mst_stages: g.stages,
      mst_gacha_ceilings: g.ceilings, mst_missions: g.missions,
      usr_users: g.users, usr_characters: g.characters, usr_equips: g.usrEquips, usr_gachas: g.usrGachas, usr_gacha_ceilings: g.usrCeilings,
      usr_missions: g.usrMissions, usr_rankings: g.rankings, usr_presents: g.presents,
      log_login: g.login, log_character: g.charlog, log_item: g.item, log_equip: g.equip, log_currency: g.cur,
      log_payment: g.pay, log_error: g.err, log_gacha: g.gacha, log_stage: g.stage,
    };
    for (const [t, rows] of Object.entries(data)) ins(t, rows);
    db.run('COMMIT');
    return { db, keys: g.keys, counts: Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length])) };
  }

  const api = { buildDatabase, generate, toT, fmt, fmtJ, WEND };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LogDB = api;
})(typeof window !== 'undefined' ? window : globalThis);
