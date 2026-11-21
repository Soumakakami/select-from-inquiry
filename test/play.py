import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8123', '-d', 'docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
# 手作りの7件の答え（ticket no → 結論, 根拠）。自動生成の93件の答えは、ページの中で同じDBを作って引く
BASE = {'CS-1104-0412': ('a', '332'), 'CS-1112-0087': ('a', '4297'), 'CS-1112-0233': ('a', '6319'), 'CS-1112-0301': ('b', 'ガンマ'),
        'CS-1111-0019': ('c', 'GPA.3391-0042-7781-55102'), 'CS-1113-0004': ('b', 'U-90417'), 'CS-1113-0002': ('b', 'U-31846')}
KEY_JS = """async () => {
  const SQL = await initSqlJs({ locateFile: (f) => f });
  const { db } = LogDB.buildDatabase(SQL);
  const key = {};
  CaseGen.build(db).forEach((c) => { key[c.no] = [c.answer, c.evidence.id != null ? String(c.evidence.id) : c.evidence.value]; });
  return key;
}"""
logs = []
def dismiss(pg):
  pg.evaluate("document.querySelectorAll('#fx-layer > *').forEach((e) => e.remove())")
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1440,'height':900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto('http://localhost:8123/index.html')
    pg.wait_for_selector('[data-act=start]', timeout=30000)
    key = dict(pg.evaluate(KEY_JS)); key.update({k: list(v) for k, v in BASE.items()})
    print('answer key:', len(key))
    pg.screenshot(path='test/shots/01_intro.png')
    pg.click('[data-act=start]')
    pg.wait_for_selector('.story-title'); pg.screenshot(path='test/shots/01b_prologue.png')
    pg.click('[data-act=story-skip]')  # プロローグ
    pg.click('.boot'); pg.wait_for_timeout(2000)  # 起動ログをスキップ → DAY 1 のカットイン
    pg.click('#run'); pg.wait_for_timeout(200)
    pg.screenshot(path='test/shots/02_case1_first_query.png')
    # wrong answer
    pg.check('input[name=choice][value=b]'); pg.fill('#evidence','1'); pg.click('#answer-form button[type=submit]')
    pg.wait_for_timeout(500); pg.screenshot(path='test/shots/03_reject.png')
    # shimatsu（1回目の DROP は夢の演出になるので、DELETE で試す）
    pg.fill('#sql', "DELETE FROM usr_users;"); pg.click('#run'); pg.wait_for_timeout(300)
    pg.screenshot(path='test/shots/04_shimatsu.png')
    pg.evaluate("document.querySelectorAll('.trash-game').forEach((e) => e.remove())")
    # heavy
    pg.fill('#sql', "SELECT * FROM log_item;"); pg.click('#run'); pg.wait_for_timeout(300)
    pg.screenshot(path='test/shots/05_heavy.png')
    # mysql-ism error
    pg.fill('#sql', "SELECT DATE_ADD(created_at, INTERVAL 9 HOUR) FROM usr_users"); pg.click('#run'); pg.wait_for_timeout(200)
    print('ERR:', pg.inner_text('#results')[:200])
    pg.fill('#sql', "SELECT created_at, CONVERT_TZ(created_at,'+09:00','+00:00') utc, NOW() now, concat('x','y') d FROM usr_users LIMIT 1"); pg.click('#run'); pg.wait_for_timeout(200)
    print('FUNCS:', pg.inner_text('#results')[:300])
    # 20日 × 5件をすべて解く
    for day in range(1, 21):
      for i in range(5):
        dismiss(pg)
        pg.wait_for_selector('#answer-form')
        no = pg.inner_text('.tno').replace('No. ', '').strip()
        c, e = key[no]
        pg.check(f'input[name=choice][value={c}]'); pg.fill('#evidence', e); pg.click('#answer-form button[type=submit]')
        pg.wait_for_selector('#btn-next', timeout=3000)
        if day == 1 and i == 0:
          pg.click('#btn-model'); pg.wait_for_timeout(400)
          pg.screenshot(path='test/shots/06_solved_1.png')
        dismiss(pg)
        pg.click('#btn-next'); pg.wait_for_timeout(150)
      if day == 1:
        pg.wait_for_timeout(5000); pg.screenshot(path='test/shots/07_day_end.png')
      if day < 20:
        pg.click('[data-act=next-day]'); pg.wait_for_timeout(300)
        pg.click('[data-act=story-skip]'); pg.wait_for_timeout(300)  # 退勤後のシーン
    pg.click('[data-act=story-skip]')  # エピローグ
    pg.wait_for_timeout(8000)  # 最終結果の演出を待つ
    pg.screenshot(path='test/shots/08_final.png')
    print('FINAL:', pg.inner_text('#modal')[:600])
    # mobile
    m = b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
    m.goto('http://localhost:8123/index.html'); m.wait_for_selector('#run:not([disabled])', timeout=30000)
    m.screenshot(path='test/shots/09_mobile_intro.png')
    b.close()
finally:
  srv.terminate()
print('\n'.join(logs[:30]))
