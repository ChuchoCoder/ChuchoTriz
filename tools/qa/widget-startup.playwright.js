// The fixture exposes the saved native slots before its dashboard store is ready.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url())) throw Error('The offline ratios fixture is required');
  const checks = [];
  const assert = (ok, detail) => { if (!ok) throw Error(detail); checks.push(detail); };
  const ratio = '.ct-ratios-widget', dollar = '.ct-intraday-widget';
  await page.getByRole('button', { name: 'RATIOS · CHUCHOTRIZ', exact: true }).click();
  await page.locator(ratio).waitFor();
  await page.getByRole('button', { name: 'DÓLAR INTRADIARIO · CHUCHOTRIZ', exact: true }).click();
  await page.locator(dollar).waitFor();
  await page.addInitScript(({ origin, ratio, dollar }) => {
    if (location.origin !== origin) return;
    const mode = sessionStorage.getItem('ct-widget-startup');
    const probe = window.widgetStartup = { reads: 0, quotes: 0, requestTimes: [] };
    let restoreStore, bootstrapRead;
    Object.defineProperty(window, 'mainStore', { configurable: true, set(store) {
      delete window.mainStore;
      const dashboard = store.dashboardStore;
      store.dashboardStore = undefined;
      window.mainStore = store;
      restoreStore = () => {
        store.dashboardStore = dashboard;
        probe.readyAt = performance.now();
      };
      if (mode) {
        const current = dashboard.currentDashboard;
        const layout = Object.getOwnPropertyDescriptor(current, 'layout');
        probe.revealPartial = () => {
          Object.defineProperty(current, 'layout', { ...layout, get: () => [] });
          store.dashboardStore = dashboard;
          document.querySelector('.CustomDashboard').removeAttribute('style');
        };
        probe.restoreLayout = () => {
          Object.defineProperty(current, 'layout', layout);
          probe.readyAt = performance.now();
        };
      }
    } });
    if (mode === 'clipped') {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelector('.CustomDashboard').style.cssText = 'height: 0; overflow: hidden';
        document.querySelector('.WidgetsComponentsPopoverList').style.display = 'none';
      }, { once: true });
    }
    window.addEventListener('message', event => {
      if (event.origin !== origin || event.source !== window) return;
      const message = event.data;
      if (message?.kind === 'request') {
        if (message.method === 'ratiosState') {
          probe.requestTimes.push(performance.now());
          if (++probe.reads === 4 && !mode) bootstrapRead = message.id;
        }
        if (message.method === 'ratioIntradayQuotes') probe.quotes++;
      }
      // Restore after the regular discovery attempts. This leaves the native DOM intact.
      if (bootstrapRead && message?.kind === 'response' && message.id === bootstrapRead && restoreStore) {
        bootstrapRead = undefined;
        setTimeout(restoreStore, 100);
      }
    });
    const observer = new MutationObserver(() => {
      if (probe.readyAt !== undefined && document.querySelector(ratio) && document.querySelector(dollar)) {
        probe.mountedAt = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { origin: new URL(page.url()).origin, ratio, dollar });
  const waitForWidgets = async () => {
    await page.waitForFunction(() => window.widgetStartup.mountedAt, null, { timeout: 12000 });
    return page.evaluate(() => Math.round(window.widgetStartup.mountedAt - window.widgetStartup.readyAt));
  };
  await page.reload({ waitUntil: 'domcontentloaded' });
  const elapsed = await waitForWidgets();
  assert(elapsed >= 0 && elapsed < 1500, 'Saved Ratios and Dollar widgets mount within 1.5 s of the store becoming ready (' + elapsed + ' ms)');
  await page.locator(dollar + ' svg[role="img"]').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-ratios-value')].some(value => value.textContent !== '—'));
  checks.push('Both saved widgets recover and display their market data');

  const staysIdle = async (detail, settle = 500) => {
    const counts = await page.evaluate(async settle => {
      if (settle) await new Promise(resolve => setTimeout(resolve, settle));
      const { reads, quotes } = window.widgetStartup;
      await new Promise(resolve => setTimeout(resolve, 5400));
      return [window.widgetStartup.reads - reads, window.widgetStartup.quotes - quotes];
    }, settle);
    assert(counts.every(count => count === 0), detail + ' (' + counts[0] + ' state reads, ' + counts[1] + ' quote reads)');
  };
  await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
  await staysIdle('Hidden saved widgets stop reading state and intraday quotes');
  await page.evaluate(() => {
    window.ratiosFixture.switchDashboard();
    document.querySelector('.GridLayout').style.display = '';
  });
  await page.locator(ratio).waitFor({ state: 'detached' });
  await staysIdle('A dashboard without ChuchoTriz widgets stops reading in idle');

  await page.evaluate(() => sessionStorage.setItem('ct-widget-startup', 'clipped'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const intersectsWindow = await page.locator('[class*="DashboardGridItem-ChuchoTrizRatiosWidget"]').evaluate(host => {
    const { width, height, top, bottom } = host.getBoundingClientRect();
    return width > 0 && height > 0 && bottom > 0 && top < innerHeight;
  });
  assert(intersectsWindow, 'The clipped slot keeps a positive bounding box inside the viewport');
  await page.waitForFunction(() => window.widgetStartup.reads >= 4);
  await staysIdle('A clipped saved slot does not keep reading while the dashboard is unavailable', 0);
  await page.evaluate(() => window.widgetStartup.revealPartial());
  const beforeLayout = await page.evaluate(() => window.widgetStartup.reads);
  await page.waitForFunction(count => window.widgetStartup.reads >= count + 2, beforeLayout);
  await page.evaluate(() => window.widgetStartup.restoreLayout());
  assert(await waitForWidgets() < 1500, 'Revealing the slots mounts them after an already identified dashboard finishes loading its layout');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.widgetStartup.revealPartial());
  await page.waitForFunction(() => window.widgetStartup.reads >= 4);
  await page.waitForFunction(() => performance.now() - window.widgetStartup.requestTimes[0] >= 8700, null, { timeout: 12000 });
  await staysIdle('An unmatched slot on an identified dashboard stops reading after the startup window', 0);
  return { checks };
}
