// Run using the shared Playwright MCP on tools/preview-free.mjs /fixture?scenario=regression.
// The catalog below is synthetic and exists only in this owned loopback page.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Select the local regression fixture.');
  const checks = [], assert = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const label = name => page.getByLabel(name, { exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const click = async locator => { await page.screenshot({ animations: 'disabled', timeout: 10000 }); await locator.click({ force: true }); };
  const wait = async fn => page.waitForFunction(fn, null, { polling: 100, timeout: 10000 });
  const book = () => page.evaluate(async () => Object.values(await chrome.storage.local.get(null)).find(v => v?.schema === 1 && Array.isArray(v.operations)));
  async function choose(name, value) {
    const control = label(name); await control.fill(value); await control.blur();
    await control.locator('..').locator('small[title]').waitFor({ state: 'visible', timeout: 10000 });
  }
  await page.addInitScript(() => {
    let store;
    Object.defineProperty(window, 'mainStore', { configurable: true, get: () => store, set: next => {
      store = next;
      const make = (id, cfiCode, currency, last, factor = 1) => ({ id, symbolStr: id, marketId: 'bm', currency, settlementType: '2', cfiCode,
        refData: { totalAmountFactor: factor, contractMultiplier: 1, roundLot: 1 }, md: { lst: last, refp: last, refdStr: new Date(Date.now() - 86400000).toISOString().slice(0, 10), seq: 10, bid: last - .1, bsz: 120, ask: last + .1, asz: 150, lstdStr: new Date().toISOString() },
        book: Object.fromEntries(Array.from({ length: 4 }, (_, i) => i + 1).flatMap(i => [[`bidBook${i}`, last - (i + 1) / 10], [`bszBook${i}`, 1000 + i], [`askBook${i}`, last + (i + 1) / 10], [`aszBook${i}`, 2000 + i]])) });
      const instruments = [make('BMA', 'ESXXXX', 'ARS', 100), make('GGAL', 'ESXXXX', 'ARS', 50), make('AL30', 'DBXXXX', 'ARS', 80000, .01), make('AL30D', 'DBXXXX', 'USD', 50, .01), make('AL30C', 'DBXXXX', 'USD', 48, .01), make('GD30', 'DBXXXX', 'ARS', 90000, .01), make('SPY', 'EMXXXX', 'ARS', 100), make('LETRA', 'DYXTXR', 'ARS', 100), make('ON', 'DBXXFR', 'ARS', 100),
        ...['ALUA', 'TXAR', 'TGSU2', 'TGNO4'].map(id => make(id, 'ESXXXX', 'ARS', 100)),
        ...[1, 7].map(days => ({ ...make(`bm_MERV_PESOS_${days}D`, 'RPXXXX', 'ARS', days === 1 ? 18.8 : 20.5), symbolStr: `PESOS - ${days}D`, settlementType: null }))];
      next.securityStore.securities = instruments;
      const original = next.securityStore.getSecurity;
      next.securityStore.getSecurity = async id => instruments.find(i => i.id === id) || original(id);
    } });
  });
  await page.evaluate(() => localStorage.removeItem('ct-demo-regression'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await click(page.getByRole('link', { name: 'Configuración' })); await click(button('Ratios'));
  await page.waitForFunction(() => { const e = document.querySelector('.ro-add-watch input'); return e && !e.disabled; }, null, { polling: 100 });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 8);
  assert(JSON.stringify(await page.locator('.ro-table-wrap tbody tr td:first-child strong').allTextContents()) === JSON.stringify(['AL30/AL30D', 'AL30/AL30C', 'AL30D/AL30C', 'GD30/AL30', 'BMA/GGAL', 'ALUA/TXAR', 'TGSU2/TGNO4', 'PESOS - 7D/PESOS - 1D']), 'Default order');
  const rates = page.locator('.ro-table-wrap tr').filter({ hasText: 'PESOS - 7D/PESOS - 1D' });
  assert(!await rates.getByRole('button', { name: 'Sólo monitor' }).isEnabled(), 'Rates cannot open price operations');
  await wait(() => [...document.querySelectorAll('.ro-table-wrap tr')].find(r => r.textContent.includes('PESOS - 7D/PESOS - 1D'))?.textContent.includes('20,50% TNA'));
  checks.push('Eight initial pairs in requested order, live TNA ratio and monitor-only cauciones');
  const bounds = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    return { table: rect('.ro-monitor-table').width, row: rect('.ro-monitor-table tbody tr').height, a: rect('.ro-add-watch input').y, add: rect('.ro-add-watch>button').y, defaults: rect('.ro-defaults').y };
  });
  assert(bounds.table < 1000 && bounds.row < 48, 'Compact content-sized columns and rows');
  assert(Math.abs(bounds.a - bounds.add) < 2 && Math.abs(bounds.a - bounds.defaults) < 2, 'Inputs and actions share one row');
  for (const width of [1024, 420, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ animations: 'disabled', timeout: 10000 });
    const layout = await page.evaluate(() => { const panel = document.querySelector('.ct-ratio-ops').getBoundingClientRect(); return [...document.querySelectorAll('.ro-monitor-controls input,.ro-monitor-controls button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= panel.left - 1 && r.right <= panel.right + 1; }); });
    assert(layout, 'Monitor controls fit at ' + width);
  }
  checks.push('Compact intrinsic table, aligned toolbar and controls at desktop, tablet and narrow widths');
  const bma = page.locator('.ro-monitor-table tr').filter({ hasText: 'BMA/GGAL' });
  const originalId = (await book()).watch.find(p => p.a.symbol === 'BMA').id;
  await click(button('Invertir BMA/GGAL')); await button('Invertir GGAL/BMA').waitFor();
  const inverse = page.locator('.ro-monitor-table tr').filter({ hasText: 'GGAL/BMA' });
  assert((await inverse.locator('.ro-ratio').innerText()).includes('-50,00%'), 'Inverse ratio');
  assert((await book()).watch.find(p => p.id === originalId).a.symbol === 'GGAL', 'Inverse keeps ID');
  assert(await inverse.locator('.ct-opt-quote-changed').count() === 0, 'New pair identity does not flash');
  await click(button('Invertir GGAL/BMA')); await button('Invertir BMA/GGAL').waitFor();
  checks.push('Pair inversion preserves row ID and recalculates values without false update flashes');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.ro-monitor-table tr')].find(r => r.textContent.includes('BMA/GGAL'));
    window.__ratioMonitorPulses = [];
    new MutationObserver(() => { for (const index of [1, 2, 3]) { const node = row.cells[index].querySelector('.ct-opt-quote-changed'); if (node) window.__ratioMonitorPulses.push({ index, up: node.classList.contains('ct-opt-quote-up'), down: node.classList.contains('ct-opt-quote-down'), animation: getComputedStyle(node).animationName, background: getComputedStyle(node).backgroundColor }); } }).observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.lst = 110; s.md.seq++;
  });
  await page.waitForFunction(() => window.__ratioMonitorPulses.some(p => p.index === 1 && p.up) && window.__ratioMonitorPulses.some(p => p.index === 3 && p.up), null, { polling: 50, timeout: 10000 });
  assert((await bma.locator('.ro-daily').innerText()) === '+10,00%', 'Daily variation of ratio');
  await page.waitForFunction(() => !document.querySelector('.ro-monitor-table .ct-opt-quote-changed'), null, { polling: 50, timeout: 10000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__ratioMonitorPulses = []; const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.lst = 105; s.md.seq++; });
  await page.waitForFunction(() => window.__ratioMonitorPulses.some(p => p.index === 3 && p.down && p.animation === 'none' && p.background !== 'rgba(0, 0, 0, 0)'), null, { polling: 50, timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('.ro-monitor-table .ct-opt-quote-changed'), null, { polling: 50, timeout: 10000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('Daily variation uses native reference prices; subtle directional pulses and reduced-motion cleanup');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.lst = 100; s.md.seq++; s.md.refp = undefined; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].find(r => r.textContent.includes('BMA/GGAL'))?.querySelector('.ro-daily').textContent === '—');
  assert((await bma.locator('.ro-ratio').innerText()).includes('100,00%'), 'Missing reference does not hide current ratio');
  assert((await bma.locator('.ro-daily').getAttribute('title')).includes('referencia'), 'Missing reference explained');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.refp = 100; s.md.refdStr = '2020-01-01'; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].find(r => r.textContent.includes('BMA/GGAL'))?.querySelector('.ro-daily').title.includes('distintas'));
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.refdStr = mainStore.securityStore.securities.find(s => s.id === 'GGAL').md.refdStr; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].find(r => r.textContent.includes('BMA/GGAL'))?.querySelector('.ro-daily').textContent === '0,00%');
  checks.push('Missing or mismatched daily references show a dash while retaining the current ratio');
  await click(button('Quitar par AL30/AL30D'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 7);
  await page.reload({ waitUntil: 'domcontentloaded' }); await click(page.getByRole('link', { name: 'Configuración' })); await click(button('Ratios'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 7);
  assert((await book()).watchDefaults === 1, 'Initialization retained');
  await click(button('Agregar pares predeterminados'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 8);
  checks.push('Removed defaults stay removed after reload; explicit restoration adds only missing pairs');
  await choose('Instrumento A', 'SPY'); await choose('Instrumento B', 'GGAL');
  await page.waitForFunction(() => [...document.querySelectorAll('.ro-add-watch button')].some(b => b.textContent === 'Agregar par' && !b.disabled), null, { polling: 100 });
  await click(button('Agregar par')); await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 9);
  await wait(() => [...document.querySelectorAll('.ro-table-wrap tr')].find(r => r.textContent.includes('BMA/GGAL'))?.textContent.includes('100,00'));
  checks.push('Exact ticker blur, monitor live prices and percent ratio');
  await click(page.locator('.ro-table-wrap tr').filter({ hasText: 'BMA/GGAL' }).getByRole('button', { name: 'Abrir operación' })); await label('Precio de entrada A').waitFor();
  assert(await label('DDMM A %').inputValue() === '0.0847', 'Equity DDMM A'); assert(await label('DDMM B %').inputValue() === '0.0847', 'Equity DDMM B'); assert(await label('Comisión %').inputValue() === '0', 'Commission default');
  await page.waitForFunction(() => document.querySelector('[aria-label="Cantidad B"]').value === '200', null, { polling: 100 });
  const orderBook = page.getByRole('table', { name: 'Book de A', exact: true });
  assert(await orderBook.locator('tbody tr').count() === 5, 'Five native book levels');
  assert((await orderBook.locator('tbody tr').first().innerText()).includes('120,00'), 'Best-level volume');
  assert((await orderBook.locator('tbody tr').nth(4).innerText()).includes('2.004,00'), 'Fifth-level native volume');
  for (const width of [1440, 1024, 420, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ animations: 'disabled', timeout: 10000 });
    const fits = await page.evaluate(() => [...document.querySelectorAll('.ro-leg')].every(leg => {
      const price = leg.querySelector('[aria-label^="Precio de entrada"]').getBoundingClientRect(), quantity = leg.querySelector('[aria-label^="Cantidad"]').getBoundingClientRect();
      const book = leg.querySelector('.ro-book-table').getBoundingClientRect(), bounds = leg.getBoundingClientRect();
      return price.left < quantity.left && book.right <= bounds.right + 1 && book.left >= bounds.left - 1;
    })); assert(fits, 'Price precedes quantity and book fits at ' + width);
  }
  checks.push('Price precedes quantity; compact five-level native book fits desktop, tablet and mobile');
  const ticketBefore = await page.locator('#MiniOrderForm input').evaluateAll(es => es.map(e => e.value));
  await click(button('Usar Compra nivel 1 de A')); assert(await label('Precio de entrada A').inputValue() === '99.9', 'Native md best bid sets price');
  await click(button('Usar Venta nivel 2 de A')); assert(await label('Precio de entrada A').inputValue() === '100.2', 'Deeper ask sets entry');
  assert(await button('Usar Venta nivel 2 de A').getAttribute('aria-pressed') === 'true', 'Selected ask');
  const tint = await button('Usar Venta nivel 2 de A').evaluate(e => getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number));
  assert(tint[0] > tint[1], 'Selected ask is red');
  assert(await label('Cantidad A').inputValue() === '100', 'Book volume does not overwrite entry quantity');
  assert(JSON.stringify(await page.locator('#MiniOrderForm input').evaluateAll(es => es.map(e => e.value))) === JSON.stringify(ticketBefore), 'Book clicks leave the ticket unchanged');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(i => i.id === 'BMA'); s.book.askBook1 = 101.2; s.md.seq++; });
  await page.waitForFunction(() => document.querySelector('[aria-label="Usar Venta nivel 2 de A"]')?.textContent.includes('101,20'), null, { polling: 100, timeout: 10000 });
  assert(await label('Precio de entrada A').inputValue() === '100.2', 'Live book update does not move chosen entry');
  checks.push('Native best and deeper prices selectable with volumes, red selection, frozen entry and no ticket or form submission');
  await label('Precio de entrada A').fill('100'); await label('Ratio objetivo').fill('105');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(i => i.id === 'BMA'); s.md.lst = 110; s.md.seq++; });
  await page.waitForFunction(() => document.querySelector('[aria-label="Usar último de A"]')?.textContent.includes('110,00'), null, { polling: 100 });
  assert(await label('Precio de entrada A').inputValue() === '100', 'Live updates preserve entry');
  checks.push('Default DDMM, auto sizing, depth, ask selection and frozen entry');
  await click(button('Abrir operación')); await button('Editar').waitFor();
  let saved = await book(); assert(saved.operations.length === 1 && saved.watch.length === 9, 'Record and watched pairs'); const id = saved.operations[0].id;
  assert(saved.operations[0].targetRatio === 2.05, 'Canonical goal');
  await label('Precio cierre A').fill('110'); await label('Precio cierre B').fill('45'); await click(button('Cerrar 25%'));
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('Parcial'));
  saved = await book(); assert(saved.operations[0].legs[0].exits[0].quantity === 25, 'Partial close');
  await click(button('Editar')); await label('Comisión %').fill('0.5'); await click(button('Guardar cambios'));
  await button('Editar').waitFor();
  saved = await book(); assert(saved.operations.length === 1 && saved.operations[0].id === id && saved.operations[0].legs[0].exits.length === 1 && saved.operations[0].commission === .5, 'Edit keeps identity and close');
  checks.push('Open, partial close and edit same operation with retained history');
  await click(button('Eliminar')); await button('Deshacer eliminación').waitFor(); assert((await book()).operations.length === 0, 'Delete'); await click(button('Deshacer eliminación')); await button('Editar').waitFor(); assert((await book()).operations[0].id === id, 'Undo');
  const original = JSON.stringify((await book()).operations);
  await page.reload({ waitUntil: 'domcontentloaded' }); await click(page.getByRole('link', { name: 'Configuración' })); await click(button('Ratios'));
  await button('Abrir operación').first().waitFor(); assert(JSON.stringify((await book()).operations) === original, 'Reload preserves records');
  checks.push('Delete/undo and reload persistence');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'OTHER-DEMO'; });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 8);
  assert(await page.locator('.ro-table-wrap tr').filter({ hasText: 'SPY/GGAL' }).count() === 0, 'Account isolation');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'DEMO-NO-BROKER'; });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 9); checks.push('Account switch clears old account, seeds defaults separately and restores original local book');
  const bond = page.locator('tr').filter({ hasText: 'AL30/AL30D' }); await click(bond.getByRole('button', { name: 'Abrir operación' }));
  assert(await label('DDMM A %').inputValue() === '0.01', 'Bond DDMM');
  assert(await label('Conversión para cantidades').count() === 0, 'Mixed currencies require no FX input');
  await wait(() => document.querySelector('[aria-label="Cantidad B"]').value === '100');
  await label('Cantidad A').fill('137'); assert(await label('Cantidad B').inputValue() === '137', 'B copies nominal quantity A');
  await label('Cantidad A').fill('250'); await label('Precio de entrada B').fill('55');
  assert(await label('Cantidad B').inputValue() === '250', 'Changing entry prices does not rebalance mixed-currency nominals');
  await page.waitForFunction(() => { const last = document.querySelector('[aria-label="Usar último de B"]'); return last && !last.disabled && Number(document.querySelector('[aria-label="Precio de entrada A"]').value) > 0; }, null, { polling: 100, timeout: 10000 });
  await click(button('Usar último de B')); assert(await label('Cantidad B').inputValue() === '250', 'Quote selection retains copied nominals');
  await label('Cantidad A').fill('100');
  assert((await page.locator('.ro-entry-heading output').innerText()).includes('1.600,00'), 'Raw mixed currency ratio');
  await label('Ratio objetivo').fill('1650'); await click(button('Abrir operación'));
  await button('Editar').nth(1).waitFor();
  saved = await book(); assert(saved.operations.length === 2 && saved.operations[1].legs[0].factor === .01 && saved.operations[1].legs[1].quantity === 100 && saved.operations[1].fx === 1, 'Bond units and equal nominal quantities');
  assert((await page.locator('.ro-operations-table').innerText()).includes('USD'), 'Separate monetary P&L');
  checks.push('Mixed currencies copy A nominals without FX or price rebalancing, retain factors and separate P&L');
  const mixedId = saved.operations[1].id;
  await page.evaluate(async id => {
    const values = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(values)) if (value?.schema === 1 && value.operations.some(o => o.id === id)) {
      const old = value.operations.find(o => o.id === id); old.legs[1].quantity = 80; old.fx = 1600; value.revision = crypto.randomUUID(); await chrome.storage.local.set({ [key]: value });
    }
  }, mixedId);
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('100,00 / 80,00'));
  const mixedRow = page.locator('.ro-operations-table tr').filter({ hasText: 'AL30/AL30D' });
  await click(mixedRow.getByRole('button', { name: 'Editar', exact: true }));
  assert(await label('Cantidad B').inputValue() === '80', 'Historical B quantity retained on edit');
  await label('Comisión %').fill('0.25'); await click(button('Guardar cambios')); await mixedRow.getByRole('button', { name: 'Editar', exact: true }).waitFor();
  saved = await book(); assert(saved.operations[1].legs[1].quantity === 80 && saved.operations[1].fx === 1600, 'Unrelated correction does not rewrite historical sizing');
  await click(mixedRow.getByRole('button', { name: 'Editar', exact: true })); await label('Cantidad A').fill('120');
  assert(await label('Cantidad B').inputValue() === '120', 'Explicit A change synchronizes historical B');
  await click(button('Guardar cambios')); await mixedRow.getByRole('button', { name: 'Editar', exact: true }).waitFor();
  saved = await book(); assert(saved.operations[1].legs[0].quantity === 120 && saved.operations[1].legs[1].quantity === 120, 'Equal nominal correction saved');
  checks.push('Legacy unequal quantities survive other edits; changing A explicitly synchronizes B');
  await label('Precio cierre A').fill('80000'); await label('Precio cierre B').fill('50'); await click(button('Cerrar todo'));
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('Cerrada'));
  const closedRow = page.locator('.ro-operations-table tr').filter({ hasText: 'AL30/AL30D' });
  await click(closedRow.getByRole('button', { name: 'Eliminar', exact: true })); await button('Deshacer eliminación').waitFor();
  assert((await book()).operations.length === 1, 'Closed history can be removed');
  await click(button('Deshacer eliminación')); await closedRow.waitFor(); assert((await book()).operations[1].legs[0].exits.length === 1, 'Closed history restored');
  checks.push('Closed-record cleanup and undo retain final exit history');
  return { checks, count: checks.length, productionBundle: true, syntheticOnly: true };
}
