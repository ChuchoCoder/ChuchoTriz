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
    const probe = window.widgetStartup = { reads: 0, quotes: 0 };
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
    } });
    window.addEventListener('message', event => {
      if (event.origin !== origin || event.source !== window) return;
      const message = event.data;
      if (message?.kind === 'request') {
        if (message.method === 'ratiosState' && ++probe.reads === 4) bootstrapRead = message.id;
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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.widgetStartup.mountedAt, null, { timeout: 12000 });
  const elapsed = await page.evaluate(() => Math.round(window.widgetStartup.mountedAt - window.widgetStartup.readyAt));
  assert(elapsed >= 0 && elapsed < 1500, 'Saved Ratios and Dollar widgets mount within 1.5 s of the store becoming ready (' + elapsed + ' ms)');
  await page.locator(dollar + ' svg[role="img"]').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-ratios-value')].some(value => value.textContent !== '—'));
  checks.push('Both saved widgets recover and display their market data');

  const staysIdle = async detail => {
    const counts = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      const { reads, quotes } = window.widgetStartup;
      await new Promise(resolve => setTimeout(resolve, 3200));
      return [window.widgetStartup.reads - reads, window.widgetStartup.quotes - quotes];
    });
    assert(counts.every(count => count === 0), detail);
  };
  await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
  await staysIdle('Hidden saved widgets stop reading state and intraday quotes');
  await page.evaluate(() => {
    window.ratiosFixture.switchDashboard();
    document.querySelector('.GridLayout').style.display = '';
  });
  await page.locator(ratio).waitFor({ state: 'detached' });
  await staysIdle('A dashboard without ChuchoTriz widgets stops reading in idle');
  return { checks };
}
