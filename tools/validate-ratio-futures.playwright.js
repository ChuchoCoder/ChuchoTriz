// Run only on tools/ratios-fixture.mjs in the shared profile, never on a broker.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url()) || !await page.evaluate(() => !!window.ratiosFixture)) throw Error('Select the offline ratios fixture.');
  const checks = [], assert = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
  const button = name => page.getByRole('button', { name, exact: true });
  const select = async (name, symbol) => {
    const input = page.getByRole('combobox', { name, exact: true });
    await input.fill(symbol); await input.blur();
    await input.locator('..').locator('small[title]').waitFor({ timeout: 12000 });
  };
  const settings = async () => {
    await page.evaluate(() => { const nav = document.querySelector('.DirectAccessBar'); Object.assign(nav.style, { position: 'fixed', left: '0', top: '0', width: '40px', height: '40px' }); });
    await page.getByRole('link', { name: 'Configuración (ChuchoTriz)', exact: true }).click();
    await button('Ratios').click();
    await page.locator('.ro-monitor-table tbody tr').first().waitFor();
  };
  await page.evaluate(() => { localStorage.removeItem('ct-ratios-fixture-main'); localStorage.removeItem('ct-ratios-fixture-settings'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await button('RATIOS · CHUCHOTRIZ').click();
  await button('Agregar ratio').click();
  await select('A · Numerador', 'AL30'); await select('B · Denominador', 'AL30D');
  await page.getByRole('checkbox', { name: 'Comparar A/B con una referencia', exact: true }).check();
  await select('Referencia C · ej. Dólar oficial', 'DLR/NOV26');
  assert((await page.getByRole('combobox', { name: 'Referencia C · ej. Dólar oficial', exact: true }).locator('..').innerText()).includes('Futuro · referencia'), 'Future is identified as an A3 reference contract in the picker');
  await button('Agregar').click();
  const widgetRow = page.locator('.ct-ratios tbody tr').filter({ hasText: 'MEP AL30 vs DLR/NOV26' });
  await widgetRow.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-ratios tbody tr')].some(r => r.textContent.includes(' vs DLR/NOV26') && r.textContent.includes('-12,50% (200,00)')));
  assert(true, 'Widget saves the exact November contract and uses its price without multiplying by 1000');
  await page.reload({ waitUntil: 'domcontentloaded' }); await widgetRow.waitFor();
  assert(await widgetRow.count() === 1, 'Future reference survives a real page reload');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_NOV26'); s.md.lst = 1750; s.md.seq++; });
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-ratios tbody tr')].some(r => r.textContent.includes(' vs DLR/NOV26') && r.textContent.includes('-20,00% (350,00)')));
  assert(true, 'Widget updates when the future publishes a new quote');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_NOV26'); s.md.lst = undefined; s.md.seq++; });
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-ratios tbody tr')].some(r => r.textContent.includes(' vs DLR/NOV26') && !r.textContent.includes('-20,00%')));
  assert(true, 'Missing future last price clears the comparison instead of substituting a close or another contract');
  await settings();
  await select('Instrumento A', 'AL30'); await select('Instrumento B', 'AL30D');
  await page.getByRole('checkbox', { name: 'Agregar referencia C', exact: true }).check();
  await select('Referencia C · ej. DLR/SPOT', 'DLR/DIC26'); await button('Agregar par').click();
  const monitorRow = page.locator('.ro-monitor-table tbody tr').filter({ hasText: 'MEP AL30 vs DLR/DIC26' });
  await monitorRow.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ro-monitor-table tbody tr')].some(r => r.textContent.includes(' vs DLR/DIC26') && r.textContent.includes('-15,15% (250,00)')));
  assert(await monitorRow.getByRole('button', { name: 'Abrir operación', exact: true }).isEnabled(), 'Monitor saves December independently and opens the referenced A/B pair');
  const chartLink = monitorRow.locator('.ct-ratio-chart-link');
  const target = new URL(await chartLink.getAttribute('href'), page.url());
  assert(target.origin === new URL(page.url()).origin && target.pathname.startsWith('/security/'), 'Chart link stays on the loopback security fixture');
  const [popup] = await Promise.all([page.waitForEvent('popup'), chartLink.click()]);
  try {
    await popup.waitForFunction(() => document.querySelector('.ct-ratio-chart-status')?.textContent.includes('velas de 5 min'), null, { timeout: 12000 });
    const snapshot = await popup.evaluate(() => window.ratioChartFixture.snapshot());
    assert(snapshot.resolution === '5' && snapshot.chartType === 1 && snapshot.studies.some(s => s.name === 'Overlay' && s.inputs.symbol === 'DLR/DIC26' && s.pane === 1 && s.scalePosition === 'new-right' && s.scaleMode === 0), 'Chart gives the exact future C its own numeric pane with five-minute candles above');
  } finally { await popup.close(); }
  await page.reload({ waitUntil: 'domcontentloaded' }); await settings(); await monitorRow.waitFor();
  assert(await monitorRow.count() === 1, 'Monitor future reference survives a real page reload');
  return { passed: checks.length, checks, simulated: true, brokerConnection: false };
}
