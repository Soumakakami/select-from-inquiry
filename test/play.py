import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8123', '-d', 'docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
ANS = [('a','332'),('a','9180'),('a','6080'),('b','ガンマ'),('c','GPA.3391-0042-7781-55102'),('b','U-90417'),('b','U-31846')]
# チケットは毎回ランダムな順番で届くので、表示中のチケット番号から答えを引く
TICKET_NO = ['CS-1104-0412','CS-1112-0087','CS-1112-0233','CS-1112-0301','CS-1111-0019','CS-1113-0004','CS-1113-0002']
def answer_for(pg):
  no = pg.inner_text('.tno')
  return ANS[next(k for k, n in enumerate(TICKET_NO) if n in no)]
logs = []
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1440,'height':900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto('http://localhost:8123/index.html')
    pg.wait_for_selector('#run:not([disabled])', timeout=30000)
    pg.screenshot(path='test/shots/01_intro.png')
    pg.click('[data-act=start]')
    pg.click('.boot'); pg.wait_for_timeout(800)  # 起動ログをスキップ
    pg.click('#run'); pg.wait_for_timeout(200)
    pg.screenshot(path='test/shots/02_case1_first_query.png')
    # wrong answer
    pg.check('input[name=choice][value=b]'); pg.fill('#evidence','1'); pg.click('#answer-form button[type=submit]')
    pg.wait_for_timeout(500); pg.screenshot(path='test/shots/03_reject.png')
    # shimatsu
    pg.fill('#sql', "DELETE FROM users;"); pg.click('#run'); pg.wait_for_timeout(300)
    pg.screenshot(path='test/shots/04_shimatsu.png')
    # heavy
    pg.fill('#sql', "SELECT * FROM item_logs;"); pg.click('#run'); pg.wait_for_timeout(300)
    pg.screenshot(path='test/shots/05_heavy.png')
    # mysql-ism error
    pg.fill('#sql', "SELECT DATE_ADD(created_at, INTERVAL 9 HOUR) FROM users"); pg.click('#run'); pg.wait_for_timeout(200)
    print('ERR:', pg.inner_text('#results')[:200])
    pg.fill('#sql', "SELECT created_at, CONVERT_TZ(created_at,'+09:00','+00:00') utc, NOW() now, concat('x','y') d FROM users LIMIT 1"); pg.click('#run'); pg.wait_for_timeout(200)
    print('FUNCS:', pg.inner_text('#results')[:300])
    for i in range(len(ANS)):
      pg.wait_for_selector('#answer-form')
      c, e = answer_for(pg)
      if i == 2:
        pg.click('#btn-hint'); pg.click('#btn-hint')
      pg.check(f'input[name=choice][value={c}]'); pg.fill('#evidence', e); pg.click('#answer-form button[type=submit]')
      pg.wait_for_selector('#btn-next', timeout=3000)
      if i in (0, 2):
        pg.click('#btn-model'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'test/shots/06_solved_{i+1}.png')
      pg.click('#btn-next'); pg.wait_for_timeout(300)
    pg.wait_for_timeout(6000)  # 結果画面の演出を待つ
    pg.screenshot(path='test/shots/07_final.png')
    print('FINAL:', pg.inner_text('#modal')[:600])
    # mobile
    m = b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
    m.goto('http://localhost:8123/index.html'); m.wait_for_selector('#run:not([disabled])', timeout=30000)
    m.screenshot(path='test/shots/08_mobile_intro.png')
    b.close()
finally:
  srv.terminate()
print('\n'.join(logs[:30]))
