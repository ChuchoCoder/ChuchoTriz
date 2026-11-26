// Invoke via browser_run_code_unsafe as (page, { before, after }) using two preview-free servers.
async (sharedPage, { before, after }) => {
  const urls = { before: new URL(before), after: new URL(after) };
  for (const url of Object.values(urls)) {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/fixture') throw Error('Use loopback preview-free fixtures only');
  }
  const page = await sharedPage.context().newPage();
  const cdp = await page.context().newCDPSession(page);
  let allowedOrigin;
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
  const results = { cpuRate: 4, before: [], after: [], counters: {} };
  const orderedRuns = ['before', 'after', 'after', 'before', 'before', 'after'];
  let run = 0;
  const prepare = async variant => {
    const url = new URL(urls[variant]);
    url.searchParams.set('bench', String(++run));
    allowedOrigin = url.origin;
    await page.goto(url.href);
    await page.locator('#root-chuchotriz').waitFor({ state: 'attached' });
    await page.bringToFront();
    await page.waitForFunction(() => !document.hidden && window.idleBenchmarkReady && !!document.querySelector('.ct-free-settings-item'), null, { polling: 50, timeout: 6000 });
    await page.waitForTimeout(200);
  };
  try {
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== allowedOrigin) return route.abort();
      if (url.pathname !== '/market-fixture.js') return route.continue();
      const response = await route.fetch();
      const setup = () => {
        const dashboard = document.querySelector('main');
        dashboard.classList.add('CustomDashboard');
        const grid = dashboard.appendChild(document.createElement('div'));
        grid.className = 'GridLayout';
        const layout = Array.from({ length: 12 }, (_, index) => {
          const key = 'NativeControl-' + index;
          const widget = grid.appendChild(document.createElement('div'));
          widget.className = 'DashboardGridItem DashboardGridItem-' + key;
          widget.append(document.createElement('span'));
          return { key, component: 'NativeControl', settings: {} };
        });
        const configured = { id: 'synthetic', layout, widgetsDicts: new Map(), addWidget() {}, onSave() {} };
        window.mainStore.securityStore.securities ??= [];
        window.mainStore.dashboardStore = { currentDashboard: configured, dashboards: [configured], createDashboard() {}, getDashboard() { return configured; } };
        const ready = event => {
          if (event.origin === location.origin && event.data?.kind === 'response' && event.data?.result?.dashboardId === configured.id) {
            window.idleBenchmarkReady = true;
            window.removeEventListener('message', ready);
          }
        };
        window.addEventListener('message', ready);
        window.runIdleLoad = () => new Promise(resolve => {
          const slots = [...grid.querySelectorAll('.DashboardGridItem > span')];
          let batch = 0;
          const start = performance.now();
          const timer = setInterval(() => {
            for (const slot of slots) {
              const price = document.createElement('b');
              price.textContent = String(batch);
              slot.replaceChildren(price);
            }
            if (++batch === 100) { clearInterval(timer); resolve(performance.now() - start); }
          }, 45);
        });
      };
      await route.fulfill({ response, body: (await response.text()) + '\n;(' + setup.toString() + ')();' });
    });
    await page.routeWebSocket('**/*', socket => socket.close());
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: results.cpuRate });
    for (const variant of orderedRuns) {
      await prepare(variant);
      const start = await metrics(), duration = await page.evaluate(() => window.runIdleLoad()), end = await metrics();
      results[variant].push({ elapsedMs: Math.round(duration), taskMs: +(1000 * (end.TaskDuration - start.TaskDuration)).toFixed(2),
        scriptMs: +(1000 * (end.ScriptDuration - start.ScriptDuration)).toFixed(2) });
    }
    for (const variant of ['before', 'after']) {
      await prepare(variant);
      results.counters[variant] = await page.evaluate(async () => {
        const counts = { ratiosState: 0, ticketLookups: 0, toolbarLookups: 0, ratioSlotScans: 0, widgetMenuScans: 0 };
        const listen = event => {
          if (event.origin === location.origin && event.data?.kind === 'request' && event.data?.method === 'ratiosState') counts.ratiosState++;
        };
        window.addEventListener('message', listen);
        const { getElementById, querySelector, querySelectorAll } = Document.prototype;
        Document.prototype.getElementById = function(id) {
          if (id === 'MiniOrderForm') counts.ticketLookups++;
          return getElementById.call(this, id);
        };
        Document.prototype.querySelector = function(selector) {
          if (selector === '.DirectAccessBar') counts.toolbarLookups++;
          return querySelector.call(this, selector);
        };
        Document.prototype.querySelectorAll = function(selector) {
          if (selector === '[data-ct-ratios-slot]') counts.ratioSlotScans++;
          if (selector === '.WidgetsComponentsPopoverList') counts.widgetMenuScans++;
          return querySelectorAll.call(this, selector);
        };
        try { await window.runIdleLoad(); return counts; }
        finally {
          Object.assign(Document.prototype, { getElementById, querySelector, querySelectorAll });
          window.removeEventListener('message', listen);
        }
      });
    }
    return results;
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
    await cdp.detach().catch(() => {});
    await page.close();
  }
}
