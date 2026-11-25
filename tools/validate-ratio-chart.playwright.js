// Production bundle and bridge on the owned loopback fixture; no broker or orders.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url()) || !await page.evaluate(() => !!window.ratiosFixture)) throw Error('Select the offline ratios fixture.');
  await page.evaluate(() => { localStorage.removeItem('ct-ratios-fixture-main'); localStorage.removeItem('ct-ratios-fixture-settings'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'RATIOS · CHUCHOTRIZ', exact: true }).click();
  await page.locator('.ct-ratios tbody tr').first().waitFor();
  const checks = [], assert = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
  const original = page.url();
  const config = () => page.evaluate(() => JSON.stringify(window.mainStore.dashboardStore.currentDashboard.layout.map(w => w.settings)));
  const before = await config();
  const open = async (link, comparison, hasC = false) => {
    const href = await link.getAttribute('href');
    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    try {
      await popup.waitForFunction(() => document.querySelector('.ct-ratio-chart-status')?.textContent.includes('velas de 5 min'), null, { timeout: 12000 });
      const state = await popup.evaluate(() => ({ snapshot: window.ratioChartFixture.snapshot(), opener: !!window.opener, notice: document.querySelector('.ct-ratio-chart-status').textContent }));
      const s = state.snapshot, overlay = s.studies.find(s => s.name === 'Overlay'), ratio = s.studies.find(s => s.name === 'Ratio');
      assert(popup.url() === href && page.url() === original && !state.opener, 'Chart opens in a separate tab without navigating the source or exposing its opener');
      assert(s.resolution === '5' && s.chartType === 1 && s.mainMode === 0, 'Native chart initializes numeric five-minute candles');
      assert(overlay.inputs.symbol === comparison && overlay.scalePosition === (hasC ? 'new-right' : 'new-left') && overlay.scaleMode === 0, 'Comparison has the expected symbol and numeric scale: ' + comparison);
      assert(overlay.pane === (hasC ? 1 : 0) && ratio.pane === (hasC ? 2 : 1), 'C has a separate pane between A and A/B; B is overlaid on A for plain pairs');
      assert(ratio.inputs.source === 'close' && ratio.scaleMode === 0, 'Native Ratio uses closes and a numeric scale');
      assert(s.studies.length === 2 && s.drawings === 0, 'The new chart discards inherited instruments, indicators and drawings');
      assert(ratio.overrides['plot.color'] === '#FFFFFF' && ratio.overrides['plot.plottype'] === 0, 'Ratio is an explicit white line instead of the saved style');
      if (hasC) assert(state.notice.includes('panel propio') && state.notice.includes('ratio de cierres A/B abajo'), 'The status describes the three panes');
      await popup.evaluate(() => history.pushState({}, '', '/principal/favoritos'));
      await popup.locator('.ct-ratio-chart-status').waitFor({ state: 'detached', timeout: 3000 });
      assert(true, 'Native SPA navigation retires the previous ratio notice');
    } finally { await popup.close(); }
  };
  const rows = page.locator('.ct-ratios tbody tr');
  assert(await rows.count() === await page.locator('.ct-ratios .ct-ratio-chart-link').count(), 'Every dashboard row has a chart icon');
  const plain = rows.filter({ has: page.getByText('MEP AL30', { exact: true }) });
  await open(plain.locator('.ct-ratio-chart-link'), 'AL30D');
  const composite = rows.filter({ hasText: ' vs DLR/SPOT' }).first();
  await open(composite.locator('.ct-ratio-chart-link'), 'DLR/SPOT', true);
  assert(await config() === before, 'Opening charts preserves saved dashboard settings');
  await page.evaluate(() => { const nav = document.querySelector('.DirectAccessBar'); Object.assign(nav.style, { position: 'fixed', left: '0', top: '0', width: '40px', height: '40px' }); });
  await page.getByRole('link', { name: 'Configuración (ChuchoTriz)', exact: true }).click();
  await page.getByRole('button', { name: 'Ratios', exact: true }).click();
  await page.locator('.ro-monitor-table tbody tr').first().waitFor();
  const monitorRows = page.locator('.ro-monitor-table tbody tr');
  assert(await monitorRows.count() === await page.locator('.ro-monitor-table .ct-ratio-chart-link').count(), 'Every Monitor row has a chart icon');
  const monitorC = monitorRows.filter({ hasText: 'MEP AL30 vs DLR/SPOT' }).first();
  await open(monitorC.locator('.ct-ratio-chart-link'), 'DLR/SPOT', true);
  await page.evaluate(async () => {
    const all = await chrome.storage.local.get(null), entry = Object.entries(all).find(([k]) => k.startsWith('RatioOperationsV1:'));
    if (!entry) throw Error('Missing synthetic trading book');
    const [key, book] = entry, pair = book.watch.find(p => p.a.symbol === 'BMA' && p.b.symbol === 'GGAL');
    const leg = (instrument, side) => ({ instrument: { ...instrument, cfi: 'ESXXXX', amountFactor: 1, quantityStep: 1, quantityUnit: 'nominales' }, side, quantity: 100, entry: 100, factor: 1, step: 1, ddmm: 0, exits: [] });
    await chrome.storage.local.set({ [key]: { ...book, revision: crypto.randomUUID(), operations: [{ id: 'synthetic-chart-operation', openedAt: new Date().toISOString(), direction: 1, commission: 0, fx: 1, targetRatio: null, legs: [leg(pair.a, 1), leg(pair.b, -1)] }] } });
  });
  await page.getByRole('button', { name: /3 · Operaciones abiertas/ }).click();
  const operation = page.locator('.ro-operations-table tbody tr').first(); await operation.waitFor();
  assert(await operation.locator('.ct-ratio-chart-link').count() === 1, 'Operations rows also expose the same chart action');
  await open(operation.locator('.ct-ratio-chart-link'), 'GGAL');
  return { passed: checks.length, checks, simulated: true, brokerConnection: false };
}
