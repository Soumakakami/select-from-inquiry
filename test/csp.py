import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8124', '-d', 'docs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs=[]
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    for label, csp in [('strict-no-wasm', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'")]:
      pg = b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
      pg.on('console', lambda m: logs.append(f'{m.type}: {m.text[:160]}'))
      pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
      def handle(route):
        if 'localhost' not in route.request.url: return route.abort()
        r = route.fetch()
        h = dict(r.headers); 
        if route.request.resource_type == 'document': h['content-security-policy'] = csp
        route.fulfill(response=r, headers=h)
      pg.route('**/*', handle)
      t=time.time()
      pg.goto('http://localhost:8124/index.html')
      pg.wait_for_selector('#run:not([disabled]), #conn.is-error', timeout=60000)
      print(label, 'ready in', round(time.time()-t,1),'s', pg.inner_text('#conn-label'))
      pg.click('[data-act=start]')
      pg.click('#run'); pg.wait_for_timeout(300)
      pg.screenshot(path='test/shots/09_mobile_desk.png', full_page=False)
    b.close()
finally:
  srv.terminate()
print('\n'.join(logs[:20]))
