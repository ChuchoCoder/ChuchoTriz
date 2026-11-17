// Run using the shared Playwright MCP on tools/preview-free.mjs /fixture?scenario=regression.
// The catalog below is synthetic and exists only in this owned loopback page.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Select the local regression fixture.');
  const checks = [], assert = (ok, message) => { if (!ok) throw Error(message); };
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
        refData: { totalAmountFactor: factor, contractMultiplier: 1, roundLot: 1 }, md: { lst: last, seq: 10, bid: last - .1, bsz: 120, ask: last + .1, asz: 150, lstdStr: new Date().toISOString() } });
      const instruments = [make('BMA', 'ESXXXX', 'ARS', 100), make('GGAL', 'ESXXXX', 'ARS', 50), make('AL30', 'DBXXXX', 'ARS', 80000, .01), make('AL30D', 'DBXXXX', 'USD', 50, .01), make('SPY', 'EMXXXX', 'ARS', 100), make('LETRA', 'DYXTXR', 'ARS', 100), make('ON', 'DBXXFR', 'ARS', 100)];
      next.securityStore.securities = instruments;
      const original = next.securityStore.getSecurity;
      next.securityStore.getSecurity = async id => instruments.find(i => i.id === id) || original(id);
    } });
  });
  await page.evaluate(() => localStorage.removeItem('ct-demo-regression'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await click(page.getByRole('link', { name: 'Configuración' })); await click(button('Ratios'));
  await page.waitForFunction(() => { const e = document.querySelector('.ro-add-watch input'); return e && !e.disabled; }, null, { polling: 100 });
  await choose('Instrumento A', 'BMA'); await choose('Instrumento B', 'GGAL');
  await page.waitForFunction(() => [...document.querySelectorAll('.ro-add-watch button')].some(b => b.textContent === 'Agregar par' && !b.disabled), null, { polling: 100 });
  await click(button('Agregar par')); await button('Abrir operación').waitFor();
  await wait(() => document.querySelector('.ro-ratio')?.textContent.includes('100,00'));
  checks.push('Exact ticker blur, monitor live prices and percent ratio');
  await click(button('Abrir operación')); await label('Precio de entrada A').waitFor();
  assert(await label('DDMM A %').inputValue() === '0.0847', 'Equity DDMM A'); assert(await label('DDMM B %').inputValue() === '0.0847', 'Equity DDMM B'); assert(await label('Comisión %').inputValue() === '0', 'Commission default');
  await page.waitForFunction(() => document.querySelector('[aria-label="Cantidad B"]').value === '200', null, { polling: 100 });
  assert((await button('Usar Bid de A').innerText()).includes('120'), 'Bid available size');
  await click(button('Usar Ask de A')); assert(await label('Precio de entrada A').inputValue() === '100.1', 'Ask sets entry'); assert(await button('Usar Ask de A').getAttribute('aria-pressed') === 'true', 'Selected ask');
  await label('Precio de entrada A').fill('100'); await label('Ratio objetivo').fill('105');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(i => i.id === 'BMA'); s.md.lst = 110; s.md.seq++; });
  await page.waitForFunction(() => document.querySelector('[aria-label="Usar último de A"]')?.textContent.includes('110,00'), null, { polling: 100 });
  assert(await label('Precio de entrada A').inputValue() === '100', 'Live updates preserve entry');
  checks.push('Default DDMM, auto sizing, depth, ask selection and frozen entry');
  await click(button('Abrir operación')); await button('Editar').waitFor();
  let saved = await book(); assert(saved.operations.length === 1 && saved.watch.length === 1, 'Record and watched pair'); const id = saved.operations[0].id;
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
  await button('Abrir operación').waitFor(); assert(JSON.stringify((await book()).operations) === original, 'Reload preserves records');
  checks.push('Delete/undo and reload persistence');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'OTHER-DEMO'; });
  await wait(() => document.querySelector('.ro-empty')?.textContent.includes('Agregá un par'));
  assert(await button('Abrir operación').count() === 0, 'Account isolation');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'DEMO-NO-BROKER'; });
  await button('Abrir operación').waitFor(); checks.push('Account switch clears old account and restores original local book');
  await choose('Instrumento A', 'AL30'); await choose('Instrumento B', 'AL30D');
  await page.waitForFunction(() => [...document.querySelectorAll('.ro-add-watch button')].some(b => b.textContent === 'Agregar par' && !b.disabled), null, { polling: 100 });
  await click(button('Agregar par'));
  const bond = page.locator('tr').filter({ hasText: 'AL30/AL30D' }); await click(bond.getByRole('button', { name: 'Abrir operación' }));
  assert(await label('DDMM A %').inputValue() === '0.01', 'Bond DDMM'); await label('Conversión para cantidades').fill('1600');
  await wait(() => document.querySelector('[aria-label="Cantidad B"]').value === '100');
  assert((await page.locator('.ro-entry-heading output').innerText()).includes('1.600,00'), 'Raw mixed currency ratio');
  await label('Ratio objetivo').fill('1650'); await click(button('Abrir operación'));
  await button('Editar').nth(1).waitFor();
  saved = await book(); assert(saved.operations.length === 2 && saved.operations[1].legs[0].factor === .01 && saved.operations[1].legs[1].quantity === 100, 'Bond units and FX');
  assert((await page.locator('.ro-operations-table').innerText()).includes('USD'), 'Separate monetary P&L');
  checks.push('Bond factors, DDMM, FX sizing, numeric ratio target and separate currency P&L');
  await label('Precio cierre A').fill('80000'); await label('Precio cierre B').fill('50'); await click(button('Cerrar todo'));
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('Cerrada'));
  const closedRow = page.locator('.ro-operations-table tr').filter({ hasText: 'AL30/AL30D' });
  await click(closedRow.getByRole('button', { name: 'Eliminar', exact: true })); await button('Deshacer eliminación').waitFor();
  assert((await book()).operations.length === 1, 'Closed history can be removed');
  await click(button('Deshacer eliminación')); await closedRow.waitFor(); assert((await book()).operations[1].legs[0].exits.length === 1, 'Closed history restored');
  checks.push('Closed-record cleanup and undo retain final exit history');
  return { checks, count: checks.length, productionBundle: true, syntheticOnly: true };
}
