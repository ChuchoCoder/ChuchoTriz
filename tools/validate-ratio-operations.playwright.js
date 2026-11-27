// Run using the shared Playwright MCP on tools/preview-free.mjs /fixture?scenario=regression.
// The catalog below is synthetic and exists only in this owned loopback page.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Select the local regression fixture.');
  const checks = [], assert = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const label = name => page.getByLabel(name, { exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const finishAnimations = () => page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.playbackRate && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
  });
  const click = async locator => { await finishAnimations(); await locator.click({ force: true }); };
  const wait = async (fn, arg = null) => page.waitForFunction(fn, arg, { polling: 100, timeout: 10000 });
  const book = () => page.evaluate(async () => Object.values(await chrome.storage.local.get(null)).find(v => [1, 2, 3, 4].includes(v?.schema) && Array.isArray(v.operations)));
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
      const instruments = [make('BMA', 'ESXXXX', 'ARS', 100), make('GGAL', 'ESXXXX', 'ARS', 50), make('AL30', 'DBXXXX', 'ARS', 80000, .01), make('AL30D', 'DBXXXX', 'USD', 50, .01), make('AL30C', 'DBXXXX', 'EXT', 48, .01), make('GD30', 'DBXXXX', 'ARS', 90000, .01), make('SPY', 'EMXXXX', 'ARS', 100), make('LETRA', 'DYXTXR', 'ARS', 100), make('ON', 'DBXXFR', 'ARS', 100),
        ...['ALUA', 'TXAR', 'TGSU2', 'TGNO4'].map(id => make(id, 'ESXXXX', 'ARS', 100)),
        ...[1, 7].map(days => ({ ...make(`bm_MERV_PESOS_${days}D`, 'RPXXXX', 'ARS', days === 1 ? 18.8 : 20.5), symbolStr: `PESOS - ${days}D`, settlementType: null }))];
      instruments.push({ ...make('rx_DDF_DLR_SPOT', 'MRIXXX', 'ARS', 1572.5), marketId: 'rx', settlementType: null });
      instruments.push({ ...make('rx_DDF_DLR_DIC26', 'FXXXXX', 'ARS', 160000), symbolStr: 'DLR/DIC26', marketId: 'rx', settlementType: null });
      next.securityStore.securities = instruments;
      const original = next.securityStore.getSecurity;
      next.securityStore.getSecurity = async id => instruments.find(i => i.id === id) || original(id);
    } });
  });
  await page.evaluate(() => localStorage.removeItem('ct-demo-regression'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Configuración' }).click(); await click(button('Ratios'));
  await page.waitForFunction(() => { const e = document.querySelector('.ro-monitor-controls input'); return e && !e.disabled; }, null, { polling: 100 });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 10);
  assert(JSON.stringify(await page.locator('.ro-table-wrap tbody tr td:first-child strong').allTextContents()) === JSON.stringify(['MEP AL30', 'CCL AL30', 'CANJE AL30', 'GD30/AL30', 'BMA/GGAL', 'ALUA/TXAR', 'TGSU2/TGNO4', 'PESOS - 7D/PESOS - 1D', 'MEP AL30 vs DLR/SPOT', 'CCL AL30 vs DLR/SPOT']), 'Default order');
  const compareToggle = label('Agregar referencia C');
  const reference = label('Referencia C · ej. DLR/SPOT');
  const focusIs = control => control.evaluate(element => document.activeElement === element);
  await compareToggle.press('Space');
  assert(await focusIs(reference), 'Keyboard activation focuses the new reference');
  await button('3 · Operaciones abiertas (0)').press('Enter');
  const monitor = button('1 · Monitor');
  await monitor.press('Enter');
  await reference.waitFor();
  assert(await focusIs(monitor), 'Returning to Monitor with a blank reference keeps focus on the navigation button');
  const referenceRow = await page.locator('.ro-monitor-controls').evaluate(toolbar => {
    const center = control => { const box = control.getBoundingClientRect(); return box.y + box.height / 2; };
    const [a, b, c] = toolbar.querySelectorAll('[role=combobox]');
    const [add, defaults] = toolbar.querySelectorAll('button');
    return [a, b, c, add, defaults].map(center);
  });
  assert(Math.max(...referenceRow) - Math.min(...referenceRow) < 3, 'Both add actions stay aligned with A, B and optional C on desktop');
  const numerator = label('Instrumento A'), denominator = label('Instrumento B');
  await numerator.fill('al3');
  await numerator.locator('..').locator('[role=option][aria-selected=true]').filter({ has: page.getByText('AL30', { exact: true }) }).waitFor();
  await page.keyboard.press('Tab');
  await numerator.locator('..').locator('small[title="AL30"]').waitFor();
  assert(await focusIs(denominator), 'Tab confirms the first suggestion for al3 and moves from A to B');
  await denominator.fill('30d'); await page.keyboard.press('Tab');
  await denominator.locator('..').locator('small[title="AL30D"]').waitFor();
  assert(await focusIs(reference), 'Tab resolves a partial B ticker and moves directly from B to C');
  await page.keyboard.press('Shift+Tab');
  assert(await focusIs(denominator), 'Monitor Shift+Tab returns from C to B');
  await compareToggle.uncheck();
  checks.push('Monitor accepts the highlighted partial ticker with Tab and preserves keyboard focus while entering A, B and C or switching views');
  const rates = page.locator('.ro-table-wrap tr').filter({ hasText: 'PESOS - 7D/PESOS - 1D' });
  assert(!await rates.getByRole('button', { name: 'Sólo monitor' }).isEnabled(), 'Rates cannot open price operations');
  await wait(() => [...document.querySelectorAll('.ro-table-wrap tr')].find(r => r.textContent.includes('PESOS - 7D/PESOS - 1D'))?.textContent.includes('20,50% TNA'));
  checks.push('Ten initial pairs including both dollar spreads in requested order, live TNA ratio and monitor-only cauciones');
  const bounds = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const center = selector => { const box = rect(selector); return box.y + box.height / 2; };
    return { table: rect('.ro-monitor-table').width, row: rect('.ro-monitor-table tbody tr').height, a: center('.ro-monitor-controls input'), add: center('.ro-monitor-controls button'), defaults: center('.ro-defaults') };
  });
  assert(bounds.table < 1000 && bounds.row < 48, 'Compact content-sized columns and rows');
  assert(Math.abs(bounds.a - bounds.add) < 2 && Math.abs(bounds.a - bounds.defaults) < 2, 'Inputs and actions share one row');
  for (const width of [1024, 420, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await finishAnimations();
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.ct-ratio-ops').getBoundingClientRect();
      const controlsFit = [...document.querySelectorAll('.ro-monitor-controls input,.ro-monitor-controls button')].every(e => {
        const r = e.getBoundingClientRect();
        return r.left >= panel.left - 1 && r.right <= panel.right + 1;
      });
      const chartLinks = [...document.querySelectorAll('.ro-monitor-table .ct-ratio-chart-link')];
      const chartX = chartLinks.map(link => link.getBoundingClientRect().left);
      const chartsAligned = chartLinks.length === 10 && Math.max(...chartX) - Math.min(...chartX) < 1;
      return { controlsFit, chartsAligned };
    });
    assert(layout.controlsFit, 'Monitor controls fit at ' + width);
    assert(layout.chartsAligned, 'Chart links align in tradable and monitor-only rows at ' + width);
  }
  checks.push('Compact table, aligned chart links and toolbar controls at desktop, tablet and narrow widths');
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
    new MutationObserver(() => { for (const index of [1, 2, 4]) { const node = row.cells[index].querySelector('.ct-opt-quote-changed'); if (node) window.__ratioMonitorPulses.push({ index, up: node.classList.contains('ct-opt-quote-up'), down: node.classList.contains('ct-opt-quote-down'), animation: getComputedStyle(node).animationName, background: getComputedStyle(node).backgroundColor }); } }).observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.lst = 110; s.md.seq++;
  });
  await page.waitForFunction(() => window.__ratioMonitorPulses.some(p => p.index === 1 && p.up) && window.__ratioMonitorPulses.some(p => p.index === 4 && p.up), null, { polling: 50, timeout: 10000 });
  assert((await bma.locator('.ro-daily').innerText()) === '+10,00%', 'Daily variation of ratio');
  await page.waitForFunction(() => !document.querySelector('.ro-monitor-table .ct-opt-quote-changed'), null, { polling: 50, timeout: 10000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__ratioMonitorPulses = []; const s = mainStore.securityStore.securities.find(s => s.id === 'BMA'); s.md.lst = 105; s.md.seq++; });
  await page.waitForFunction(() => window.__ratioMonitorPulses.some(p => p.index === 4 && p.down && p.animation === 'none' && p.background !== 'rgba(0, 0, 0, 0)'), null, { polling: 50, timeout: 10000 });
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
  await click(button('Quitar par MEP AL30'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 9);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('link', { name: 'Configuración' }).click(); await click(button('Ratios'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 9);
  assert((await book()).watchDefaults === 1, 'Initialization retained');
  await click(button('Agregar pares predeterminados'));
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 10);
  checks.push('Removed defaults stay removed after reload; explicit restoration adds only missing pairs');
  await choose('Instrumento A', 'SPY'); await choose('Instrumento B', 'GGAL');
  await page.waitForFunction(() => [...document.querySelectorAll('.ro-monitor-controls button')].some(b => b.textContent === 'Agregar par' && !b.disabled), null, { polling: 100 });
  await page.evaluate(() => {
    const store = mainStore.securityStore;
    const original = store.getSecurity;
    const pending = new Promise(resolve => {
      window.releaseSpyQuote = () => { store.getSecurity = original; resolve(); };
    });
    store.getSecurity = async id => {
      if (id === 'SPY') await pending;
      return original.call(store, id);
    };
  });
  await click(button('Agregar par')); await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 11);
  const spy = page.locator('.ro-monitor-table tr').filter({ has: button('Invertir SPY/GGAL') });
  await click(spy.getByRole('button', { name: 'Abrir operación', exact: true }));
  assert(await label('Precio de entrada A').inputValue() === '', 'New pair waits for its first snapshot');
  await label('Precio de entrada B').fill('49');
  await page.evaluate(() => window.releaseSpyQuote());
  await wait(() => document.querySelector('[aria-label="Usar Venta nivel 1 de A"]')?.getAttribute('aria-pressed') === 'true');
  assert(await label('Precio de entrada A').inputValue() === '100.1' && await label('Precio de entrada B').inputValue() === '49', 'The first snapshot fills the pending Ask and preserves manual input');
  await click(button('Volver al monitor'));
  await wait(() => [...document.querySelectorAll('.ro-table-wrap tr')].find(r => r.textContent.includes('BMA/GGAL'))?.textContent.includes('100,00'));
  checks.push('Exact ticker blur, monitor live ratio and first snapshot prefill for a newly added pair');
  const openBmaGgal = bma.getByRole('button', { name: 'Abrir operación' });
  await click(openBmaGgal); await label('Precio de entrada A').waitFor();
  assert(await page.locator('.ro-entry-heading').count() === 0, 'No redundant opening title');
  const longA = button('Long BMA / Short GGAL'), longB = button('Long GGAL / Short BMA');
  assert(await longA.getAttribute('aria-pressed') === 'true', 'Long A uses its actual ticker');
  assert(await label('Precio de entrada A').inputValue() === '100.1' && await label('Precio de entrada B').inputValue() === '49.9', 'Opening from Monitor prefills Ask A / Bid B');
  assert(await button('Usar Venta nivel 1 de A').getAttribute('aria-pressed') === 'true' && await button('Usar Compra nivel 1 de B').getAttribute('aria-pressed') === 'true', 'Opening from Monitor highlights both best prices');
  const marketRatio = label('Ratio de mercado A/B');
  assert((await marketRatio.innerText()) === '100,00%', 'Opening shows the same last-price A/B ratio as Monitor');
  await click(longB);
  assert((await page.getByRole('region', { name: 'Pata A', exact: true }).innerText()).includes('Venta · Short') && (await page.getByRole('region', { name: 'Pata B', exact: true }).innerText()).includes('Compra · Long'), 'Long B ticker maps to correct leg sides');
  assert(await label('Precio de entrada A').inputValue() === '99.9' && await label('Precio de entrada B').inputValue() === '50.1', 'Long B selects Bid A / Ask B');
  assert(await button('Usar Compra nivel 1 de A').getAttribute('aria-pressed') === 'true' && await button('Usar Venta nivel 1 de B').getAttribute('aria-pressed') === 'true', 'Both selected book sides highlighted');
  assert((await marketRatio.innerText()) === '100,00%', 'Reversing long/short leaves the displayed market ratio in A/B order');
  await click(longA);
  assert(await label('Precio de entrada A').inputValue() === '100.1' && await label('Precio de entrada B').inputValue() === '49.9', 'Long A selects Ask A / Bid B');
  assert(await label('Cantidad A').inputValue() === '100' && await label('Cantidad B').inputValue() === '201', 'Auto sizing uses entry quotes without copying book sizes');
  await label('Precio de entrada A').fill('123'); await click(longA);
  assert(await label('Precio de entrada A').inputValue() === '100.1', 'Clicking the active direction also reloads entry quotes');
  await page.evaluate(() => { const s=mainStore.securityStore.securities.find(i=>i.id==='BMA'); s.md.ask=undefined; s.md.seq++; });
  await wait(() => document.querySelector('[aria-label="Usar Venta nivel 1 de A"]').disabled);
  await click(longA);
  assert(await label('Precio de entrada A').inputValue() === '' && await label('Precio de entrada B').inputValue() === '49.9', 'Missing Ask clears only that price instead of substituting last or deeper ask');
  assert((await page.getByRole('alert').innerText()).includes('Ask de BMA'), 'Missing side identified');
  await click(button('Volver al monitor')); await click(openBmaGgal);
  assert(await label('Precio de entrada A').inputValue() === '' && await label('Precio de entrada B').inputValue() === '49.9', 'Opening from Monitor leaves only the missing side empty');
  assert((await page.getByRole('alert').innerText()).includes('Ask de BMA'), 'Opening from Monitor identifies the missing Ask');
  await page.evaluate(() => { const s=mainStore.securityStore.securities.find(i=>i.id==='BMA'); s.md.ask=100.1; s.md.seq++; });
  await wait(() => !document.querySelector('[aria-label="Usar Venta nivel 1 de A"]').disabled);
  assert(await label('Precio de entrada A').inputValue() === '', 'Quote arrival does not silently reset the entry');
  await click(longA); assert(await label('Precio de entrada A').inputValue() === '100.1', 'Explicit retry takes the recovered best Ask');
  assert(await page.getByRole('alert').count() === 0 && (await book()).operations.length === 0, 'Direction selection neither registers nor submits');
  checks.push('Opening from Monitor and selecting direction use best Ask for long and Bid for short, highlight both legs and handle missing best levels');
  await click(button('Usar último de A')); await click(button('Usar último de B'));
  assert(await label('DDMM A %').inputValue() === '0.0847', 'Equity DDMM A'); assert(await label('DDMM B %').inputValue() === '0.0847', 'Equity DDMM B'); assert(await label('Comisión %').inputValue() === '0', 'Commission default');
  await page.waitForFunction(() => document.querySelector('[aria-label="Cantidad B"]').value === '200', null, { polling: 100 });
  const orderBook = page.getByRole('table', { name: 'Book de A', exact: true });
  assert(await orderBook.locator('tbody tr').count() === 5, 'Five native book levels');
  assert((await orderBook.locator('tbody tr').first().innerText()).includes('120,00'), 'Best-level volume');
  assert((await orderBook.locator('tbody tr').nth(4).innerText()).includes('2.004,00'), 'Fifth-level native volume');
  for (const width of [1440, 1024, 420, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await finishAnimations();
    const fits = await page.evaluate(() => [...document.querySelectorAll('.ro-leg')].every(leg => {
      const instrument = leg.querySelector('.ct-ratio-picker input').getBoundingClientRect(), price = leg.querySelector('[aria-label^="Precio de entrada"]').getBoundingClientRect(), quantity = leg.querySelector('[aria-label^="Cantidad"]').getBoundingClientRect();
      const book = leg.querySelector('.ro-book-table').getBoundingClientRect(), bounds = leg.getBoundingClientRect();
      return instrument.left < price.left && price.left < quantity.left && Math.abs(instrument.top - price.top) < 1 && Math.abs(price.top - quantity.top) < 1 && Math.abs(instrument.height - price.height) < 1 && Math.abs(price.height - quantity.height) < 1 && quantity.right <= bounds.right + 1 && book.right <= bounds.right + 1 && book.left >= bounds.left - 1;
    })); assert(fits, 'Instrument, price and quantity share an aligned row and book fits at ' + width);
    const compact = await page.evaluate(() => {
      const direction = document.querySelector('.ro-direction'), [left, right] = direction.querySelectorAll('button'), ratio = direction.querySelector('output'), l = left.getBoundingClientRect(), r = right.getBoundingClientRect(), v = ratio.getBoundingClientRect();
      return l.right <= v.left && v.right <= r.left && [...document.querySelectorAll('.ro-sizing-leg')].every(group => { const input = group.querySelector('input').getBoundingClientRect(), amount = group.querySelector('span').getBoundingClientRect(); return input.right <= amount.left && group.querySelector('input').getAttribute('aria-label').includes(group.textContent.includes('Monto A') ? 'A' : 'B'); });
    }); assert(compact, 'Opening ratio between ticker directions and DDMM before each amount at ' + width);
  }
  checks.push('Instrument, price and quantity share an aligned row; compact five-level book fits desktop, tablet and mobile');
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
  assert((await marketRatio.innerText()) === '120,00%', 'Market ratio updates with the latest trade independently of chosen prices');
  checks.push('Default DDMM, auto sizing, depth, ask selection and frozen entry');
  await click(button('Abrir operación')); await button('Editar').waitFor();
  let saved = await book(); assert(saved.operations.length === 1 && saved.watch.length === 11, 'Record and watched pairs'); const id = saved.operations[0].id;
  assert(saved.operations[0].targetRatio === 2.05, 'Canonical goal');
  for (const width of [1920, 1440, 1024, 420]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('.ro-detail').evaluate(detail => {
      const rect = element => element.getBoundingClientRect();
      const [a, b] = detail.querySelectorAll('.ro-close-leg');
      const summary = detail.querySelector('.ro-pnl-lines'), position = detail.querySelector('.ro-detail-summary table');
      const fits = [...detail.querySelectorAll('.ro-close-leg :is(input,button)')].every(control => rect(control).right <= rect(detail).right && control.scrollWidth <= control.clientWidth);
      const quotesInRows = [a, b].every(leg => {
        const [last, bid, ask] = leg.querySelectorAll('.ro-close-quotes button');
        return rect(last).top === rect(bid).top && rect(bid).top === rect(ask).top && rect(last).right < rect(bid).left && rect(bid).right < rect(ask).left;
      });
      return { fits, quotesInRows, legsSideBySide: rect(a).right < rect(b).left, summarySideBySide: rect(summary).right < rect(position).left };
    });
    assert(layout.fits && layout.quotesInRows, 'Close fields fit and quotes run horizontally at ' + width);
    if (width === 1920) assert(layout.legsSideBySide && layout.summarySideBySide, 'Wide detail lays out both legs and both summary sections side by side');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('Close uses horizontal quote rows on narrow and wide displays and lays out both legs and summaries side by side when space allows');
  const closeQuote = (source, leg) => page.getByRole('button', { name: new RegExp(`^Usar ${source} para el cierre ${leg}:`) });
  assert(await page.locator('.ro-close-book-side').count() === 2 &&
    (await closeQuote('Compra', 'A').getAttribute('class')).includes('ro-close-book-side') &&
    (await closeQuote('Venta', 'B').getAttribute('class')).includes('ro-close-book-side'), 'Close highlights Bid for long and Ask for short');
  await closeQuote('Compra', 'A').click(); await closeQuote('Último', 'B').click();
  assert(await label('Precio cierre A').inputValue() === '99.9' && await label('Precio cierre B').inputValue() === '50', 'Click copies each live quote into its own field');
  await page.evaluate(() => {
    const [a, b] = ['BMA', 'GGAL'].map(id => mainStore.securityStore.securities.find(i => i.id === id));
    a.md.bid = 98.75; a.md.seq++;
    b.md.ask = undefined; b.md.lst = 51; b.md.seq++;
  });
  await wait(() => document.querySelector('[aria-label^="Usar Compra para el cierre A:"]')?.textContent.includes('98,75') &&
    document.querySelector('[aria-label^="Usar Último para el cierre B:"]')?.textContent.includes('51,00') &&
    document.querySelector('[aria-label^="Usar Venta para el cierre B:"]')?.disabled);
  assert(await label('Precio cierre A').inputValue() === '99.9' && await label('Precio cierre B').inputValue() === '50', 'New quotes do not overwrite copied prices');
  assert(JSON.stringify((await book()).operations) === JSON.stringify(saved.operations), 'Quote buttons leave the ledger untouched');
  await page.evaluate(() => {
    const s = mainStore.securityStore.securities.find(i => i.id === 'GGAL');
    s.md.ask = 50.1; s.md.lst = 50; s.md.seq++;
  });
  await wait(() => document.querySelector('[aria-label^="Usar Venta para el cierre B:"]')?.disabled === false);
  await closeQuote('Venta', 'B').click(); await label('Precio cierre A').fill('110');
  checks.push('Close shows both live quotes and corresponding book sides, holds copied prices and disables missing quotes');
  await click(button('Cerrar 25%'));
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('Parcial'));
  saved = await book();
  assert(saved.operations[0].legs[0].exits[0].quantity === 25 && saved.operations[0].legs[0].exits[0].price === 110 &&
    saved.operations[0].legs[1].exits[0].price === 50.1, 'Partial close saves both manual and copied prices');
  await click(button('Editar'));
  assert((await label('Ratio de apertura').innerText()) === '100,00%', 'Editing shows the stored entry ratio rather than the live market ratio');
  await label('Comisión %').fill('0.5'); await click(button('Guardar cambios'));
  await button('Editar').waitFor();
  saved = await book(); assert(saved.operations.length === 1 && saved.operations[0].id === id && saved.operations[0].legs[0].exits.length === 1 && saved.operations[0].commission === .5, 'Edit keeps identity and close');
  checks.push('Open, partial close and edit same operation with retained history');
  await click(button('Eliminar')); await button('Deshacer eliminación').waitFor(); assert((await book()).operations.length === 0, 'Delete'); await click(button('Deshacer eliminación')); await button('Editar').waitFor(); assert((await book()).operations[0].id === id, 'Undo');
  const original = JSON.stringify((await book()).operations);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('link', { name: 'Configuración' }).click(); await click(button('Ratios'));
  await button('Abrir operación').first().waitFor(); assert(JSON.stringify((await book()).operations) === original, 'Reload preserves records');
  checks.push('Delete/undo and reload persistence');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'OTHER-DEMO'; });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 10);
  assert(await page.locator('.ro-table-wrap tr').filter({ hasText: 'SPY/GGAL' }).count() === 0, 'Account isolation');
  await page.evaluate(() => { mainStore.profileStore.activeAccount = 'DEMO-NO-BROKER'; });
  await wait(() => document.querySelectorAll('.ro-table-wrap tbody tr').length === 11); checks.push('Account switch clears old account, seeds defaults separately and restores original local book');
  const bond = page.locator('.ro-monitor-table tr').filter({ has: button('Invertir MEP AL30') }); await click(bond.getByRole('button', { name: 'Abrir operación' }));
  assert(await label('DDMM A %').inputValue() === '0.01', 'Bond DDMM');
  assert(await label('Conversión para cantidades').count() === 0, 'Mixed currencies require no FX input');
  await wait(() => document.querySelector('[aria-label="Cantidad B"]').value === '100');
  await label('Cantidad A').fill('137'); assert(await label('Cantidad B').inputValue() === '137', 'B copies nominal quantity A');
  await label('Cantidad A').fill('250'); await label('Precio de entrada B').fill('55');
  assert(await label('Cantidad B').inputValue() === '250', 'Changing entry prices does not rebalance mixed-currency nominals');
  await wait(() => ['A', 'B'].every(leg => document.querySelector(`[aria-label="Usar último de ${leg}"]`)?.disabled === false));
  await click(button('Usar último de A'));
  await click(button('Usar último de B')); assert(await label('Cantidad B').inputValue() === '250', 'Quote selection retains copied nominals');
  await label('Cantidad A').fill('100');
  assert((await marketRatio.innerText()).includes('1.600,00'), 'Raw mixed currency market ratio');
  await label('Ratio objetivo').fill('1650'); await click(button('Abrir operación'));
  await button('Editar').nth(1).waitFor();
  saved = await book(); assert(saved.operations.length === 2 && saved.operations[1].legs[0].factor === .01 && saved.operations[1].legs[1].quantity === 100 && saved.operations[1].fx === 1, 'Bond units and equal nominal quantities');
  assert((await page.locator('.ro-operations-table').innerText()).includes('USD'), 'Separate monetary P&L');
  checks.push('Mixed currencies copy A nominals without FX or price rebalancing, retain factors and separate P&L');
  const mixedId = saved.operations[1].id;
  await page.evaluate(async id => {
    const values = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(values)) if ([1, 2, 3, 4].includes(value?.schema) && value.operations.some(o => o.id === id)) {
      const old = value.operations.find(o => o.id === id); old.legs[1].quantity = 80; old.fx = 1600; value.revision = crypto.randomUUID(); await chrome.storage.local.set({ [key]: value });
    }
  }, mixedId);
  await wait(() => document.querySelector('.ro-operations-table')?.textContent.includes('100,00 / 80,00'));
  const mixedRow = page.locator('.ro-operations-table tr').filter({ has: page.getByLabel('Par AL30/AL30D', { exact: true }) });
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
  const closedRow = page.locator('.ro-operations-table tr').filter({ has: page.getByLabel('Par AL30/AL30D', { exact: true }) });
  await click(closedRow.getByRole('button', { name: 'Eliminar', exact: true })); await button('Deshacer eliminación').waitFor();
  assert((await book()).operations.length === 1, 'Closed history can be removed');
  await click(button('Deshacer eliminación')); await closedRow.waitFor(); assert((await book()).operations[1].legs[0].exits.length === 1, 'Closed history restored');
  checks.push('Closed-record cleanup and undo retain final exit history');
  await click(button('1 · Monitor'));
  await click(page.locator('.ro-monitor-table tr').filter({ hasText: 'BMA/GGAL' }).getByRole('button', { name: 'Abrir operación', exact: true }));
  await page.evaluate(() => { const s=mainStore.securityStore.securities.find(i=>i.id==='BMA'); mainStore.securityStore.securities.push({ ...s, id:'LOT10', symbolStr:'LOT10', refData:{ ...s.refData, roundLot:10 } }); });
  await choose('Instrumento A', 'LOT10');
  await wait(() => document.querySelector('[aria-label="Cantidad A"]').min === '10' && Number(document.querySelector('[aria-label="Precio de entrada A"]').value) > 0);
  assert(await label('Cantidad A').evaluate(e=>!e.validity.stepMismatch&&e.checkValidity()), 'Default 100 is valid for a native lot of ten');
  await label('Cantidad A').fill('105'); assert(await label('Cantidad A').evaluate(e=>e.validity.stepMismatch), 'Nonmultiple quantity remains invalid');
  await label('Cantidad A').fill('110'); await click(button('Long LOT10 / Short GGAL'));
  assert(await label('Cantidad A').evaluate(e=>e.checkValidity()), 'Another multiple of ten is valid');
  await click(button('Abrir operación'));
  const lotRow = page.locator('.ro-operations-table tr').filter({ has:page.getByLabel('Par LOT10/GGAL',{exact:true}) }); await lotRow.waitFor();
  assert((await book()).operations.find(o=>o.legs[0].instrument.symbol==='LOT10')?.legs[0].quantity === 110, 'Native lot multiple submits and persists');
  await click(lotRow.getByRole('button',{name:'Eliminar',exact:true}));
  await lotRow.waitFor({ state: 'hidden' });
  checks.push('Native lots greater than one accept and save valid multiples while rejecting nonmultiples');
  await button('1 · Monitor').click();
  await click(page.locator('.ro-monitor-table tr').filter({ hasText: 'BMA/GGAL' }).getByRole('button', { name: 'Abrir operación', exact: true }));
  await click(button('Long GGAL / Short BMA')); await click(button('Abrir operación'));
  const sideRows = page.locator('.ro-operations-table tr').filter({ has: page.getByLabel('Par BMA/GGAL', { exact: true }) });
  await wait(() => document.querySelectorAll('.ro-operations-table [aria-label="Par BMA/GGAL"]').length === 2);
  for (const [index, sides] of [[0, ['Long', 'Short']], [1, ['Short', 'Long']]]) {
    const chips = await sideRows.nth(index).locator('.ro-pair-chips>.ro-chip').evaluateAll(es => es.map(e => ({ ticker:e.querySelector('strong').textContent, side:e.querySelector('span').textContent, buy:e.classList.contains('buy'), sell:e.classList.contains('sell') })));
    assert(chips.length === 2 && chips.every((c,i) => c.ticker === ['BMA','GGAL'][i] && c.side === sides[i] && c.buy === (sides[i] === 'Long') && c.sell === (sides[i] === 'Short')), 'Operation chips preserve A/B order and identify the actual long/short legs');
  }
  const chipAlignment = await page.locator('.ro-operations-table tbody tr').evaluateAll(es => es.map(e => {
    const center = selector => { const r = e.querySelector(selector).getBoundingClientRect(); return r.y + r.height / 2; };
    return !/Abierta|Parcial|Cerrada/.test(e.querySelector('.ro-pair-cell').textContent) && !!e.querySelector('.ro-state') && Math.abs(center('.ro-pair-chips') - center('.ro-actions')) < 1;
  }));
  assert(chipAlignment.length && chipAlignment.every(Boolean), 'State has its own column and chips align vertically with row actions');
  checks.push('Operation pairs use green Long and red Short chips in both directions without changing A/B order; state is separate and chips centered');
  await click(button('1 · Monitor'));
  await click(button('Quitar par MEP AL30 vs DLR/SPOT'));
  await choose('Instrumento A', 'AL30'); await choose('Instrumento B', 'AL30D');
  await page.getByLabel('Agregar referencia C', { exact: true }).check();
  await choose('Referencia C · ej. DLR/SPOT', 'Dólar oficial');
  await click(button('Agregar par'));
  const comparison = page.locator('.ro-monitor-table tr').filter({ hasText: 'MEP AL30 vs DLR/SPOT' });
  await comparison.waitFor();
  await wait(() => [...document.querySelectorAll('.ro-ratio')].some(e => e.textContent === '+1,75% (27,50)'));
  assert((await comparison.innerText()).includes('1.572,50'), 'The comparison shows native official spot alongside MEP bond prices');
  assert(await comparison.getByRole('button', { name: 'Abrir operación', exact: true }).isEnabled(), 'Valid A/B can open with a spot reference');
  assert((await book()).schema === 2, 'Three-price monitor books reject legacy readers');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT'); s.md.lst = 1600; s.md.seq++; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].some(e => e.textContent.includes('MEP AL30 vs DLR/SPOT') && e.querySelector('.ro-ratio').textContent === '0,00% (0,00)'));
  const cclComparison = page.locator('.ro-monitor-table tr').filter({ hasText: 'CCL AL30 vs DLR/SPOT' });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].some(e => e.textContent.includes('CCL AL30 vs DLR/SPOT') && e.querySelector('.ro-ratio').textContent === '+4,17% (66,67)'));
  assert(await cclComparison.getByRole('button', { name: 'Abrir operación', exact: true }).isEnabled(), 'CCL can also open with a spot reference');
  checks.push('MEP and CCL spreads refresh independently from the same official spot');
  await page.evaluate(() => mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT').md.refp = undefined);
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].filter(e => e.querySelector('strong')?.textContent.includes(' vs DLR/SPOT')).every(e => e.querySelector('.ro-daily').textContent === '—'));
  assert(await cclComparison.locator('.ro-ratio').innerText() === '+4,17% (66,67)', 'Missing C reference retains the CCL ratio');
  await page.evaluate(() => Object.assign(mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT').md, { refp: 1565, refdStr: '2020-01-01' }));
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].filter(e => e.querySelector('strong')?.textContent.includes(' vs DLR/SPOT')).every(e => e.querySelector('.ro-daily').title.includes('distintas')));
  checks.push('Missing or mismatched official daily references hide only the daily variation of both spreads');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT'); s.md.lst = 0; s.md.seq++; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].filter(e => e.querySelector('strong')?.textContent.includes(' vs DLR/SPOT')).every(e => e.querySelector('.ro-ratio').textContent === '—'));
  checks.push('A zero official quote never falls back to unnormalized MEP or CCL');
  await page.evaluate(() => mainStore.webSocketConnectionStatus = false);
  await wait(() => !!document.querySelector('.ro-issue')?.textContent.includes('desconectado'));
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT'); Object.assign(s.md, { lst: 1600, seq: 0, refdStr: mainStore.securityStore.securities.find(s => s.id === 'AL30').md.refdStr }); mainStore.webSocketConnectionStatus = true; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].some(e => e.textContent.includes('CCL AL30 vs DLR/SPOT') && e.querySelector('.ro-ratio').textContent === '+4,17% (66,67)'));
  assert(await comparison.locator('.ro-ratio').innerText() === '0,00% (0,00)', 'MEP comparison restored after official reconnect');
  checks.push('Disconnect/reconnect preserves both saved comparisons and accepts a reset official quote sequence');
  checks.push('MEP/official spread, native spot updates, opening availability and schema compatibility');
  await page.evaluate(() => { const s = mainStore.securityStore.securities.find(s => s.id === 'AL30'); s.md.lst = 70000; s.md.seq++; });
  await wait(() => [...document.querySelectorAll('.ro-monitor-table tr')].some(e => e.textContent.includes('MEP AL30 vs DLR/SPOT') && e.querySelector('.ro-ratio').textContent === '-12,50% (200,00)'));
  assert(await comparison.locator('.ro-ratio').innerText() === '-12,50% (200,00)', 'Negative spread keeps its sign only in the percentage');
  checks.push('Reference C comparisons include unsigned absolute quote differences for positive, negative and zero spreads');
  await page.evaluate(() => { const ss = mainStore.securityStore.securities; Object.assign(ss.find(s => s.id === 'AL30').md, { lst: 80000 }); ss.find(s => s.id === 'AL30').md.seq++; ss.find(s => s.id === 'rx_DDF_DLR_SPOT').md.lst = 1000; ss.find(s => s.id === 'rx_DDF_DLR_SPOT').md.seq++; });
  await wait(() => [...document.querySelectorAll('.ro-ratio')].some(e => e.textContent === '+60,00% (600,00)'));
  await page.evaluate(() => { const ss = mainStore.securityStore.securities; ss.find(s => s.id === 'AL30').md.lst = 160000; ss.find(s => s.id === 'AL30').md.seq++; ss.find(s => s.id === 'rx_DDF_DLR_SPOT').md.lst = 2000; ss.find(s => s.id === 'rx_DDF_DLR_SPOT').md.seq++; });
  await wait(() => [...document.querySelectorAll('.ro-ratio')].some(e => e.textContent === '+60,00% (1.200,00)'));
  checks.push('The absolute difference refreshes even when the normalized ratio remains unchanged');
  const rowIds = selector => page.locator(selector + ' tbody tr').evaluateAll(es => es.map(e => e.dataset.rowId));
  const originalOrder = (await book()).watch.map(p => p.id), originalRevision = (await book()).revision;
  const financialSnapshot = () => book().then(b => JSON.stringify([...b.operations].sort((a,b) => a.id.localeCompare(b.id))));
  const originalFinancial = await financialSnapshot();
  await click(button('Ordenar por Último A'));
  assert(await button('Ordenar por Último A').locator('..').getAttribute('aria-sort') === 'ascending', 'Header exposes ascending order');
  const visibleNumbers = () => page.locator('.ro-monitor-table tbody tr td:nth-child(2)').allTextContents().then(ts => ts.map(t => parseFloat(t.replace(/\./g,'').replace(',','.'))).filter(Number.isFinite));
  let numbers = await visibleNumbers(); assert(numbers.every((n,i) => !i || numbers[i-1] <= n), 'Monitor prices sort numerically ascending');
  await click(button('Ordenar por Último A')); numbers = await visibleNumbers();
  assert(numbers.every((n,i) => !i || numbers[i-1] >= n), 'Monitor prices sort numerically descending');
  assert((await book()).revision === originalRevision, 'Column sorting never writes the ledger');
  await click(button('Ordenar por Último A')); assert(JSON.stringify(await rowIds('.ro-monitor-table')) === JSON.stringify(originalOrder), 'Third click restores saved manual order');
  for (let i=0;i<2;i++) {
    await click(button('Ordenar por Referencia C'));
    const missing = await page.locator('.ro-monitor-table tbody tr td:nth-child(4)').allTextContents();
    assert(missing.slice(0,2).every(t => t.trim() !== '—') && missing.slice(2).every(t => t.trim() === '—'), 'Missing references remain last in either sort direction');
  }
  checks.push('Numeric ascending/descending sorting, accessible headers, missing values last and manual reset do not mutate saved records');
  await click(button('Ordenar por Par A/B'));
  await page.setViewportSize({width:1440,height:1400});
  await page.waitForFunction(()=>document.querySelector('.ro-monitor-table th[aria-sort=ascending] button')?.textContent.includes('Par A/B'));
  const sortedMonitor = await rowIds('.ro-monitor-table'), expectedMonitor = [...sortedMonitor.slice(1), sortedMonitor[0]];
  await page.locator('.ro-monitor-table tbody tr').first().locator('.ro-row-handle').dragTo(
    page.locator('.ro-monitor-table tbody tr').last().locator('td').first(), { timeout: 12000 });
  await page.waitForFunction(id => document.querySelector('.ro-monitor-table tbody tr')?.dataset.rowId === id && document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false', expectedMonitor[0], {polling:100,timeout:10000});
  assert(JSON.stringify((await book()).watch.map(p => p.id)) === JSON.stringify(expectedMonitor), 'Real drag converts the visible sorted order to saved manual order');
  assert(await button('Ordenar por Par A/B').locator('..').getAttribute('aria-sort') === 'none', 'Drag switches back to manual mode');
  const keyboardId = expectedMonitor[0];
  await page.locator('.ro-monitor-table tbody tr').first().locator('.ro-row-handle').focus();
  await page.locator('.ro-monitor-table tbody tr').first().locator('.ro-row-handle').press('ArrowDown');
  await page.waitForFunction(id => document.querySelector('.ro-monitor-table tbody tr:nth-child(2)')?.dataset.rowId === id && document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false', keyboardId, {polling:100,timeout:10000});
  let keyboardOrder = (await book()).watch.map(p => p.id);
  assert(keyboardOrder[1] === keyboardId, 'Keyboard moves the focused row one slot');
  assert(await page.evaluate(id=>document.activeElement?.closest('tr')?.dataset.rowId===id,keyboardId), 'Keyboard focus survives the first save');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(id=>document.querySelector('.ro-monitor-table tbody tr:nth-child(3)')?.dataset.rowId===id&&document.querySelector('.ro-row-handle').getAttribute('aria-disabled')==='false',keyboardId,{polling:100,timeout:10000});
  keyboardOrder=(await book()).watch.map(p=>p.id);
  assert(keyboardOrder[2]===keyboardId,'A second keyboard move works without refocusing');
  assert(await financialSnapshot() === originalFinancial, 'Monitor reordering leaves operation prices, fees and history intact');
  await page.reload({waitUntil:'domcontentloaded'}); await page.getByRole('link',{name:'Configuración'}).click(); await click(button('Ratios'));
  await wait(() => !!document.querySelector('.ro-row-handle') && document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false');
  assert(JSON.stringify(await rowIds('.ro-monitor-table')) === JSON.stringify(keyboardOrder), 'Manual monitor order survives reload');
  checks.push('Real drag from sorted view and keyboard ordering persist by account without changing operation data');
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/})); await click(button('Todas'));
  await page.getByLabel('Moneda para ordenar P&L',{exact:true}).selectOption('USD');
  await click(button('Ordenar por Neto total'));
  const mixedOperation = (await book()).operations.find(o => o.legs[1].instrument.currency === 'USD');
  assert((await rowIds('.ro-operations-table'))[0] === mixedOperation.id, 'P&L sorting uses only the selected currency, placing other currencies last');
  assert((await button('Ordenar por Neto total').getAttribute('title')).includes('USD'), 'Money sort describes its currency');
  const sortedOperations = await rowIds('.ro-operations-table'), expectedOperations = [...sortedOperations.slice(1), sortedOperations[0]];
  await page.locator('.ro-operations-table tbody tr').first().locator('.ro-row-handle').dragTo(
    page.locator('.ro-operations-table tbody tr').last().locator('td').first(), { timeout: 12000 });
  await page.waitForFunction(id => document.querySelector('.ro-operations-table tbody tr')?.dataset.rowId === id && document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false', expectedOperations[0], {polling:100,timeout:10000});
  assert(JSON.stringify((await book()).operations.map(o => o.id)) === JSON.stringify(expectedOperations), 'Operation drag saves the projected order');
  const closedId = mixedOperation.id, closedIndex = expectedOperations.indexOf(closedId);
  await click(button('Abiertas'));
  const firstOpenId = (await rowIds('.ro-operations-table'))[0];
  await page.locator('.ro-operations-table tbody tr').first().locator('.ro-row-handle').press('ArrowDown');
  await page.waitForFunction(id => document.querySelector('.ro-operations-table tbody tr:nth-child(2)')?.dataset.rowId === id && document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false', firstOpenId, {polling:100,timeout:10000});
  assert((await rowIds('.ro-operations-table'))[1] === firstOpenId && (await book()).operations[closedIndex].id === closedId, 'Filtered keyboard reorder preserves hidden closed-record slots');
  assert(await financialSnapshot() === originalFinancial, 'Operation reordering preserves all financial fields and close history');
  checks.push('Operation ordering separates currencies, supports drag and keyboard, and preserves hidden records and accounting');
  await page.locator('.ro-operations-table tbody tr').first().locator('.ro-pair-chips').click({force:true});
  assert(await page.locator('.ro-operations-table tr.ro-selected').count() === 1 && await page.locator('.ro-detail').count() === 1, 'Clicking a row selects it and opens its detail');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme === 'dma_day' ? 'light' : 'dark');
  await page.locator(`.ct-free-settings-panel[data-color-scheme="${theme}"]`).waitFor();
  const styles = await page.evaluate(()=>{const table=document.querySelector('.ro-operations-table'),header=getComputedStyle(table.querySelector('th')),even=getComputedStyle(table.querySelector('tbody tr:nth-child(2)')),selected=getComputedStyle(table.querySelector('tr.ro-selected'));return{head:header.backgroundColor,weight:header.fontWeight,sticky:header.position,even:even.backgroundColor,selected:selected.backgroundColor};});
  assert(styles.head !== 'rgba(0, 0, 0, 0)' && styles.weight === '700' && styles.sticky === 'sticky' && styles.even !== styles.head && styles.selected !== styles.head, 'Styled headers, stripes and selected row remain distinct in '+theme);
  await page.reload({waitUntil:'domcontentloaded'}); await page.getByRole('link',{name:'Configuración'}).click(); await click(button('Ratios'));
  await wait(()=>!!document.querySelector('.ro-row-handle')&&document.querySelector('.ro-row-handle').getAttribute('aria-disabled') === 'false');
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/})); await click(button('Todas'));
  assert(JSON.stringify(await rowIds('.ro-operations-table')) === JSON.stringify((await book()).operations.map(o=>o.id)), 'Manual operation order survives reload');
  checks.push('Distinct headers and selected rows retain operation detail and manual order after reload in ' + theme);
  await page.evaluate(()=>{
    const original=chrome.storage.local.set; window.__gridOriginalSet=original;
    chrome.storage.local.set=async values=>{if(Object.keys(values).some(k=>k.startsWith('RatioOperationsV1:')))await new Promise(resolve=>window.__gridReleaseSave=resolve);return original.call(chrome.storage.local,values);};
  });
  try {
    await page.locator('.ro-operations-table tbody tr').first().locator('.ro-row-handle').press('ArrowDown');
    await wait(()=>typeof window.__gridReleaseSave==='function');
    await click(button('Ordenar por Par / sentido'));
    await page.evaluate(()=>window.__gridReleaseSave());
    await wait(()=>document.querySelector('.ro-row-handle').getAttribute('aria-disabled')==='false');
    assert(await button('Ordenar por Par / sentido').locator('..').getAttribute('aria-sort')==='ascending','A newer column sort survives an earlier reorder save completing');
    assert(await financialSnapshot()===originalFinancial,'Delayed reorder does not alter financial records');
  } finally {
    await page.evaluate(()=>{chrome.storage.local.set=window.__gridOriginalSet;window.__gridReleaseSave?.();delete window.__gridOriginalSet;delete window.__gridReleaseSave;});
  }
  checks.push('Repeated keyboard movement retains focus and a later sort choice wins over pending saves');
  const staleRows=await rowIds('.ro-operations-table'),transfer=await page.evaluateHandle(()=>new DataTransfer());
  await page.locator('.ro-operations-table tbody tr').first().locator('.ro-row-handle').dispatchEvent('dragstart',{dataTransfer:transfer});
  await page.evaluate(async()=>{const values=await chrome.storage.local.get(null);for(const [key,value] of Object.entries(values))if(key.startsWith('RatioOperationsV1:'))await chrome.storage.local.set({[key]:{...value,revision:crypto.randomUUID()}});});
  await finishAnimations();
  const beforeRejected=(await book()).operations.map(o=>o.id);
  await page.locator('.ro-operations-table tbody tr').last().dispatchEvent('drop',{dataTransfer:transfer});
  await wait(()=>document.querySelector('.ro-issue')?.textContent.includes('grilla cambió'));
  assert(JSON.stringify((await book()).operations.map(o=>o.id))===JSON.stringify(beforeRejected)&&await financialSnapshot()===originalFinancial&&staleRows.length===beforeRejected.length,'Concurrent revision changes reject stale drag without overwriting records');
  await transfer.dispose();
  checks.push('Stale drag after another writer changes the revision is rejected without data loss');

  await click(page.getByRole('button',{name:/^1 · Monitor/}));
  const columnsLedger = JSON.stringify(await book());
  const monitorPicker=page.locator('.ro-columns');
  await click(monitorPicker.locator('summary'));
  await click(button('Ordenar por Último A'));
  await monitorPicker.getByLabel('Último A',{exact:true}).uncheck();
  await wait(()=>!document.querySelector('.ro-monitor-table [aria-label="Ordenar por Último A"]'));
  await wait(()=>document.querySelector('.ro-manual-order')?.disabled);
  assert(await button('Orden manual').isDisabled(),'Hiding the sorted column clears its invisible sort');
  await click(monitorPicker.locator('summary'));
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/}));
  const operationPicker=page.locator('.ro-columns');
  await click(operationPicker.locator('summary'));
  await operationPicker.getByLabel('Realizado',{exact:true}).uncheck();
  await wait(()=>!document.querySelector('.ro-operations-table [aria-label="Ordenar por Realizado"]'));
  await click(operationPicker.locator('summary'));
  await page.reload({waitUntil:'domcontentloaded'}); await page.getByRole('link',{name:'Configuración'}).click();await click(button('Ratios'));
  await wait(()=>!!document.querySelector('.ro-row-handle')&&document.querySelector('.ro-row-handle').getAttribute('aria-disabled')==='false');
  await wait(()=>!document.querySelector('.ro-monitor-table [aria-label="Ordenar por Último A"]'));
  assert(await button('Ordenar por Realizado').count()===0,'Only the active grid is rendered');
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/}));
  await wait(()=>!document.querySelector('.ro-operations-table [aria-label="Ordenar por Realizado"]'));
  assert(await button('Ordenar por Últ. valor').count()===1,'Update time is available in operations');
  await click(page.locator('.ro-columns summary'));await click(button('Restablecer columnas'));await click(page.locator('.ro-columns summary'));
  await click(page.getByRole('button',{name:/^1 · Monitor/}));
  assert(await button('Ordenar por Último A').count()===0,'Restoring operations does not change monitor preferences');
  await click(page.locator('.ro-columns summary'));await click(button('Restablecer columnas'));await click(page.locator('.ro-columns summary'));
  await wait(()=>!!document.querySelector('.ro-monitor-table [aria-label="Ordenar por Último A"]'));
  assert(JSON.stringify(await book())===columnsLedger,'Column preferences do not write the financial ledger');
  checks.push('Independent column preferences persist across reload, reset separately and clear hidden sorts without ledger changes');
  const timed=await page.evaluate(async()=>{
    const v=await chrome.storage.local.get(null),b=Object.entries(v).find(([k])=>k.startsWith('RatioOperationsV1:'))[1],p=b.watch.find(p=>p.c),at=Date.now()-600000;
    const ids=[p.a.id,p.b.id,p.c.id];
    window.__ratioClockBackup=ids.map(id=>{const s=mainStore.securityStore.securities.find(s=>s.id===id);const previous={...s.md};s.md.lstdStr=new Date(at).toISOString();s.md.seq++;return {id,md:previous};});
    return {id:p.id,c:p.c.id,at};
  });
  const clock=at=>new Date(at).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hourCycle:'h23'});
  await wait(({id,time})=>document.querySelector('.ro-monitor-table tr[data-row-id="'+id+'"] .ro-updated')?.textContent===time,{id:timed.id,time:clock(timed.at)});
  await page.evaluate(({id,at})=>{const s=mainStore.securityStore.securities.find(s=>s.id===id);s.md.lstdStr=new Date(at+300000).toISOString();s.md.lst+=1;s.md.seq++;},{id:timed.c,at:timed.at});
  await wait(({id,time})=>document.querySelector('.ro-monitor-table tr[data-row-id="'+id+'"] .ro-updated')?.textContent===time,{id:timed.id,time:clock(timed.at+300000)});
  await page.evaluate(id=>{const s=mainStore.securityStore.securities.find(s=>s.id===id);s.md.lstdStr=undefined;s.md.seq++;},timed.c);
  await wait(id=>document.querySelector('.ro-monitor-table tr[data-row-id="'+id+'"] .ro-updated')?.textContent==='—',timed.id);
  await page.evaluate(()=>{for(const b of window.__ratioClockBackup){const s=mainStore.securityStore.securities.find(s=>s.id===b.id);s.md={...b.md,seq:Math.max(s.md.seq,b.md.seq)+1};}delete window.__ratioClockBackup;});
  checks.push('Latest value uses actual A/B/C market times, updates with C and shows missing times explicitly');
  for(const view of [1,3]){
    await click(page.getByRole('button',{name:view===1?/^1 · Monitor/:/^3 · Operaciones abiertas/}));
    const gap=await page.locator('.ro-grid-wrap').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('table').getBoundingClientRect();return a.right-b.right;});
    assert(gap<=2,'No reserved empty scrollbar gutter at the right of grid '+view);
  }
  checks.push('Both grids end at the actions column without a reserved scrollbar strip');
  await click(button('1 · Monitor'));
  await click(page.locator('.ro-monitor-table tr').filter({has:button('Invertir BMA/GGAL')}).getByRole('button',{name:'Abrir operación',exact:true}));
  await label('Cantidad A').fill('100'); await label('Precio de entrada A').fill('100'); await label('Precio de entrada B').fill('50');
  await click(button('Abrir operación')); await button('Registrar cierre').waitFor();
  const manualId=(await book()).operations.at(-1).id;
  const manual=async()=> (await book()).operations.find(o=>o.id===manualId);
  await label('Cantidad cierre A').fill('25');
  assert(await label('Cantidad cierre B').inputValue()==='50','A calculates B using the open proportion');
  await label('Cantidad cierre B').fill('60');
  assert(await label('Cantidad cierre A').inputValue()==='30','B becomes the editable source and recalculates A');
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');
  assert(await label('Cantidad cierre A').inputValue()==='30','Changing exit prices does not resize quantities');
  const beforeInvalid=JSON.stringify(await manual());
  for(const amount of ['101','0','1.5']){
    await label('Cantidad cierre A').fill(amount);
    assert(await button('Registrar cierre').isDisabled(),'Invalid nominal close blocked: '+amount);
    assert(JSON.stringify(await manual())===beforeInvalid,'Invalid input never changes the journal');
  }
  await label('Cantidad cierre A').fill('25');await click(button('Registrar cierre'));
  await page.waitForFunction(id=>{const values=JSON.parse(localStorage.getItem('ct-demo-regression')||'{}');const o=Object.values(values).flatMap(b=>b?.operations||[]).find(o=>o.id===id);return JSON.stringify(o?.legs.map(l=>l.exits.map(e=>e.quantity)))==='[[25],[50]]';},manualId,{polling:100,timeout:10000});
  let manualRecord=await manual();
  assert(manualRecord.legs[0].exits[0].quantity===25&&manualRecord.legs[1].exits[0].quantity===50&&manualRecord.legs[0].exits[0].price===110,'Nominal close saves both quantities and actual prices');
  assert(await label('Cantidad cierre A').inputValue()===''&&await label('Cantidad cierre B').inputValue()==='','Successful close clears the quantity draft');
  await label('Cantidad cierre B').fill('30');
  assert(await label('Cantidad cierre A').inputValue()==='15','Next close sizes against remaining 75/150');
  await click(button('Registrar cierre'));
  await page.waitForFunction(id=>{const values=JSON.parse(localStorage.getItem('ct-demo-regression')||'{}');const o=Object.values(values).flatMap(b=>b?.operations||[]).find(o=>o.id===id);return JSON.stringify(o?.legs.map(l=>l.exits.map(e=>e.quantity)))==='[[25,15],[50,30]]';},manualId,{polling:100,timeout:10000});
  manualRecord=await manual();
  assert(JSON.stringify(manualRecord.legs.map(l=>l.exits.map(e=>e.quantity)))==='[[25,15],[50,30]]','Repeated A/B closes keep both exit histories');
  const manualSnapshot=JSON.stringify(manualRecord);
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'Configuración'}).click();await click(button('Ratios'));
  await wait(()=>!!document.querySelector('.ro-row-handle')&&document.querySelector('.ro-row-handle').getAttribute('aria-disabled')==='false');
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/}));await click(button('Todas'));
  await click(page.locator('.ro-operations-table tr[data-row-id="'+manualId+'"]').getByRole('button',{name:'Detalle',exact:true}));
  assert(JSON.stringify(await manual())===manualSnapshot,'Manual close history survives reload');
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');
  checks.push('Nominal closes from either leg use remaining quantities, ignore price changes, reject invalid sizes and persist both histories');
  await label('Cantidad cierre B').fill('20');
  await page.evaluate(async id=>{const values=await chrome.storage.local.get(null);for(const [key,value] of Object.entries(values))if(value?.operations?.some(o=>o.id===id)){value.operations.find(o=>o.id===id).targetRatio=2.1;await chrome.storage.local.set({[key]:{...value,revision:crypto.randomUUID()}});}},manualId);
  await wait(()=>document.querySelector('.ro-close-issue')?.textContent.includes('operación cambió'));
  assert(await button('Registrar cierre').isDisabled()&&await label('Cantidad cierre A').inputValue()==='','External operation change invalidates the old close draft');
  await label('Cantidad cierre A').fill('60');assert(await label('Cantidad cierre B').inputValue()==='120','Full remaining source takes the exact other remainder');
  await click(button('Registrar cierre'));
  await wait(()=>!document.querySelector('[aria-label="Cantidad cierre A"]'));
  manualRecord=await manual();assert(JSON.stringify(manualRecord.legs.map(l=>l.exits.map(e=>e.quantity)))==='[[25,15,60],[50,30,120]]','Manual full close keeps all earlier exits');
  checks.push('Stale nominal close drafts require a fresh quantity; a full nominal close takes both exact remainders');
  await click(button('1 · Monitor'));
  await click(page.locator('.ro-monitor-table tr').filter({has:button('Invertir BMA/GGAL')}).getByRole('button',{name:'Abrir operación',exact:true}));
  await page.evaluate(()=>{const s=mainStore.securityStore.securities.find(s=>s.id==='BMA');if(!mainStore.securityStore.securities.some(s=>s.id==='LOT10'))mainStore.securityStore.securities.push({...s,id:'LOT10',symbolStr:'LOT10',refData:{...s.refData,roundLot:10}});});
  await choose('Instrumento A','LOT10');await label('Cantidad A').fill('100');await label('Precio de entrada A').fill('100');await label('Precio de entrada B').fill('50');await click(button('Abrir operación'));await button('Registrar cierre').waitFor();
  const lotCloseId=(await book()).operations.at(-1).id;
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');
  assert(await label('Cantidad cierre A').getAttribute('step')==='10','Close input respects the stored lot');
  await label('Cantidad cierre A').fill('25');assert(await button('Registrar cierre').isDisabled(),'Source lot violation rejected');
  await label('Cantidad cierre B').fill('1');assert(await button('Registrar cierre').isDisabled(),'A close below one automatic lot is rejected');
  await label('Cantidad cierre B').fill('60');await wait(()=>document.querySelector('[aria-label="Cantidad cierre A"]')?.value==='30');assert(await label('Cantidad cierre A').inputValue()==='30','Automatic lot rounding from B');
  await click(button('Registrar cierre'));
  await page.waitForFunction(id=>{const values=JSON.parse(localStorage.getItem('ct-demo-regression')||'{}');const o=Object.values(values).flatMap(b=>b?.operations||[]).find(o=>o.id===id);return JSON.stringify(o?.legs.map(l=>l.exits.map(e=>e.quantity)))==='[[30],[60]]';},lotCloseId,{polling:100,timeout:10000});
  assert(JSON.stringify((await book()).operations.find(o=>o.id===lotCloseId).legs.map(l=>l.exits[0].quantity))==='[30,60]','Lot-aligned nominal quantities are saved');
  await label('Cantidad cierre A').fill('10');
  await page.evaluate(()=>{mainStore.profileStore.activeAccount='OTHER-DEMO';});
  await wait(()=>!document.querySelector('[aria-label="Cantidad cierre A"]')&&document.querySelectorAll('.ro-monitor-table tbody tr').length===10);
  await page.evaluate(()=>{mainStore.profileStore.activeAccount='DEMO-NO-BROKER';});
  await wait(()=>document.querySelectorAll('.ro-monitor-table tbody tr').length===11);
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/}));await click(button('Todas'));
  await click(page.locator('.ro-operations-table tr[data-row-id="'+lotCloseId+'"]').getByRole('button',{name:'Detalle',exact:true}));
  assert(await label('Cantidad cierre A').inputValue()===''&&await label('Cantidad cierre B').inputValue()==='','Account switch clears nominal close drafts');
  checks.push('Nominal close inputs enforce source and automatic lots and clear drafts on account changes');
  const reviewOpen=async (pair,pa,pb)=>{
    await click(button('1 · Monitor'));
    await click(page.locator('.ro-monitor-table tr').filter({has:button('Invertir '+pair)}).getByRole('button',{name:'Abrir operación',exact:true}));
    await label('Cantidad A').fill('100');await label('Precio de entrada A').fill(pa);await label('Precio de entrada B').fill(pb);
    await click(button('Abrir operación'));await button('Registrar cierre').waitFor();
    return (await book()).operations.at(-1).id;
  };
  const reviewRecord=async id=>(await book()).operations.find(o=>o.id===id);
  const reviewWaitHistory=async(id,expected)=>page.waitForFunction(({id,expected})=>{
    const values=JSON.parse(localStorage.getItem('ct-demo-regression')||'{}'),o=Object.values(values).flatMap(b=>b?.operations||[]).find(o=>o.id===id);
    return JSON.stringify(o?.legs.map(l=>l.exits.map(e=>e.quantity)))===expected;
  },{id,expected:JSON.stringify(expected)},{polling:100,timeout:10000});
  const reviewHoldLock=async id=>page.evaluate(async id=>{
    const values=await chrome.storage.local.get(null),key=Object.entries(values).find(([,v])=>v?.operations?.some(o=>o.id===id))?.[0];
    if(!key)throw Error('Missing fixture journal');
    await new Promise(held=>{void navigator.locks.request(key,()=>new Promise(release=>{window.__qaReleaseNominalLock=release;held();}));});
  },id);
  const reviewReleaseLock=async()=>page.evaluate(()=>{window.__qaReleaseNominalLock?.();delete window.__qaReleaseNominalLock;});
  const currencyCloseId=await reviewOpen('MEP AL30','80000','50');
  await label('Precio cierre A').fill('81000');await label('Precio cierre B').fill('49');await label('Cantidad cierre B').fill('40');
  assert(await label('Cantidad cierre A').inputValue()==='40','Mixed currency nominal close copies equal open quantities without FX');
  await click(button('Registrar cierre'));await reviewWaitHistory(currencyCloseId,[[40],[40]]);
  const realizedRow=page.locator('.ro-pnl-lines>div').filter({has:page.getByText('Realizado neto',{exact:true})});
  await wait(()=>[...document.querySelectorAll('.ro-pnl-lines>div')].some(e=>e.textContent.includes('Realizado neto')&&e.textContent.includes('393,56')&&e.textContent.includes('0,40')));
  const realizedBeforeMarket=await realizedRow.innerText();
  await page.evaluate(()=>{const ss=mainStore.securityStore.securities;for(const [id,last] of [['AL30',82000],['AL30D',48]]){const s=ss.find(s=>s.id===id);s.md.lst=last;s.md.seq++;}});
  await wait(()=>[...document.querySelectorAll('.ro-pnl-lines>div')].some(e=>e.textContent.includes('Remanente neto')&&e.textContent.includes('1.190,28')&&e.textContent.includes('1,19')));
  assert(await realizedRow.innerText()===realizedBeforeMarket,'Native factors and DDMM produce separately frozen realized ARS/USD P&L');
  await page.evaluate(async id=>{const values=await chrome.storage.local.get(null);for(const [key,value] of Object.entries(values))if(value?.operations?.some(o=>o.id===id)){value.operations.find(o=>o.id===id).legs[1].quantity=80;await chrome.storage.local.set({[key]:{...value,revision:crypto.randomUUID()}});}},currencyCloseId);
  await wait(()=>document.querySelector('.ro-detail')?.textContent.includes('40,00 / 80,00'));
  await label('Cantidad cierre B').fill('20');assert(await label('Cantidad cierre A').inputValue()==='30','Legacy mixed currencies retain the actual remaining proportion 60/40');
  await click(button('Registrar cierre'));await reviewWaitHistory(currencyCloseId,[[40,30],[40,20]]);
  await label('Cantidad cierre A').fill('30');assert(await label('Cantidad cierre B').inputValue()==='20','Completing a legacy source takes its exact other remainder');
  await click(button('Registrar cierre'));await reviewWaitHistory(currencyCloseId,[[40,30,30],[40,20,20]]);
  checks.push('Mixed-currency nominal closes preserve native factors, DDMM, frozen currency-separated P&L and legacy unequal remainders');
  const oneLegId=await reviewOpen('BMA/GGAL','100','50');
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');
  await page.evaluate(async id=>{const values=await chrome.storage.local.get(null);for(const [key,value] of Object.entries(values))if(value?.operations?.some(o=>o.id===id)){value.operations.find(o=>o.id===id).legs[1].exits=[{quantity:200,price:45,at:new Date().toISOString()}];await chrome.storage.local.set({[key]:{...value,revision:crypto.randomUUID()}});}},oneLegId);
  await wait(()=>document.querySelector('[aria-label="Cantidad cierre B"]')?.disabled);
  await label('Cantidad cierre A').fill('25');assert(await label('Cantidad cierre B').inputValue()==='0','Already-closed counterpart stays at zero and cannot be edited');
  await click(button('Registrar cierre'));await reviewWaitHistory(oneLegId,[[25],[200]]);
  await label('Cantidad cierre A').fill('75');await click(button('Registrar cierre'));await reviewWaitHistory(oneLegId,[[25,75],[200]]);
  checks.push('A historical position with one closed leg finishes without duplicating that leg exit or fees');
  const revisionCloseId=await reviewOpen('BMA/GGAL','100','50');
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');await label('Cantidad cierre A').fill('25');
  const beforeRejectedClose=JSON.stringify(await reviewRecord(revisionCloseId));
  await reviewHoldLock(revisionCloseId);
  try{
    await click(button('Registrar cierre'));
    await wait(()=>document.querySelector('.ro-register-close')?.disabled);
    await page.evaluate(async id=>{const values=await chrome.storage.local.get(null);for(const [key,value] of Object.entries(values))if(value?.operations?.some(o=>o.id===id))await chrome.storage.local.set({[key]:{...value,revision:crypto.randomUUID()}});},revisionCloseId);
    await reviewReleaseLock();
    await wait(()=>document.querySelector('.ro-issue')?.textContent.includes('Otra pestaña'));
    assert(JSON.stringify(await reviewRecord(revisionCloseId))===beforeRejectedClose,'A revision change while awaiting the lock does not append exits');
  }finally{await reviewReleaseLock();}
  await page.waitForFunction(()=>document.querySelector('.ro-register-close')?.disabled===false);
  await button('Registrar cierre').evaluate(e=>{e.click();e.click();});
  await reviewWaitHistory(revisionCloseId,[[25],[50]]);
  await wait(()=>document.querySelector('[aria-label="Cantidad cierre A"]')?.value===''&&document.querySelector('[aria-label="Cantidad cierre B"]')?.value==='');
  assert((await reviewRecord(revisionCloseId)).legs.every(l=>l.exits.length===1),'A double click records each leg exactly once');
  checks.push('Concurrent revision changes reject a pending nominal close; retry and double click record each exit exactly once');
  const accountCloseId=await reviewOpen('BMA/GGAL','100','50');
  await label('Precio cierre A').fill('110');await label('Precio cierre B').fill('45');await label('Cantidad cierre A').fill('25');
  const beforeAccountClose=JSON.stringify(await reviewRecord(accountCloseId));
  await reviewHoldLock(accountCloseId);
  try{
    await click(button('Registrar cierre'));
    await page.evaluate(()=>{mainStore.profileStore.activeAccount='OTHER-DEMO';});
    await wait(()=>document.querySelectorAll('.ro-monitor-table tbody tr').length===10);
    await reviewReleaseLock();
    await wait(()=>document.querySelector('.ro-row-handle')?.getAttribute('aria-disabled')==='false');
    assert(JSON.stringify(await reviewRecord(accountCloseId))===beforeAccountClose,'Account change before save leaves the original operation untouched');
  }finally{await reviewReleaseLock();}
  await page.evaluate(()=>{mainStore.profileStore.activeAccount='DEMO-NO-BROKER';});
  await wait(()=>document.querySelectorAll('.ro-monitor-table tbody tr').length===11&&document.querySelector('.ro-row-handle')?.getAttribute('aria-disabled')==='false');
  await click(page.getByRole('button',{name:/^3 · Operaciones abiertas/}));await click(button('Todas'));
  await click(page.locator('.ro-operations-table tr[data-row-id="'+accountCloseId+'"]').getByRole('button',{name:'Detalle',exact:true}));
  assert(await label('Cantidad cierre A').inputValue()===''&&await label('Cantidad cierre B').inputValue()==='','Returning to the original account never restores a pending close draft');
  checks.push('Account switching during a locked nominal close cancels the write and clears the draft on return');
  await page.evaluate(()=>{const version=[...document.querySelectorAll('main p')].find(e=>e.textContent==='Versión: 4.24.4');if(!version)throw Error('Missing fixture version');version.textContent='Versión: 4.24.5';});
  const versionContext=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const channel='qa-version-'+crypto.randomUUID(),id=crypto.randomUUID();
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);window.postMessage({channel,kind:'detach'},location.origin);};
    const receive=event=>{const m=event.data;if(event.source===window&&m?.channel===channel&&m.kind==='response'&&m.id===id){cleanup();resolve(m);}};
    const timer=setTimeout(()=>{cleanup();reject(Error('No version context response'));},8000);
    window.addEventListener('message',receive);window.__chuchotrizRatioOperations.attach(channel);
    window.postMessage({channel,id,kind:'request',method:'ratioContext',params:{storageSalt:'a'.repeat(64)}},location.origin);
  }));
  assert(!versionContext.error&&typeof versionContext.result?.contextId==='string'&&/^[a-f0-9]{64}$/.test(versionContext.result.storageScope),'A fresh reader request accepts verified 4.24.5');
  assert(JSON.stringify((await book()).operations.find(o=>o.id===lotCloseId).legs.map(l=>l.exits[0].quantity))==='[30,60]','Verified 4.24.5 context retains the same local journal');
  checks.push('Verified Matriz 4.24.5 catalog context retains the journal and existing read-only guards');

  await click(button('1 · Monitor'));
  await click(page.locator('.ro-monitor-table tr').filter({ has: button('Invertir BMA/GGAL') }).getByRole('button', { name: 'Abrir operación', exact: true }));
  await page.evaluate(() => {
    const catalog = mainStore.securityStore.securities;
    const source = catalog.find(s => s.id === 'BMA');
    catalog.push({ ...source, id: 'ROUNDFACTOR', symbolStr: 'ROUNDFACTOR', refData: { ...source.refData, totalAmountFactor: 0.1, contractMultiplier: 3 } });
  });
  await choose('Instrumento A', 'ROUNDFACTOR');
  await label('Precio de entrada A').fill('100'); await label('Precio de entrada B').fill('50');
  await click(button('Abrir operación')); await button('Registrar cierre').waitFor();
  assert((await book()).operations.at(-1).legs[0].factor === 0.3, 'Opening saves the displayed factor precision');
  await wait(() => document.querySelector('[aria-label^="Usar Último para el cierre A:"]')?.disabled === false);
  const factorPnl = page.locator('.ro-pnl-lines > div').filter({ hasText: 'Neto al desarme' });
  assert(!(await factorPnl.innerText()).includes('—'), 'P&L uses the quote at the saved factor precision');
  await closeQuote('Compra', 'A').click();
  assert(await label('Precio cierre A').inputValue() === '99.9', 'A harmless decimal roundoff still allows copying the close quote');
  const editedFactorId = (await book()).operations.at(-1).id;
  await click(page.locator(`.ro-operations-table tr[data-row-id="${editedFactorId}"]`).getByRole('button', { name: 'Editar', exact: true }));
  await click(button('Long GGAL / Short ROUNDFACTOR'));
  await click(button('Guardar cambios')); await button('Registrar cierre').waitFor();
  assert((await book()).operations.at(-1).direction === -1, 'Editing reverses the same operation');
  assert(await label('Precio cierre A').inputValue() === '100' &&
    (await closeQuote('Venta', 'A').getAttribute('class')).includes('ro-close-book-side'), 'Reversing a leg discards the old bid and highlights its new ask');
  checks.push('Editing the direction of an open operation invalidates the previous close price selection');
  await closeQuote('Venta', 'A').click();
  await page.evaluate(() => { mainStore.securityStore.securities.find(s => s.id === 'ROUNDFACTOR').refData.contractMultiplier = 4; });
  await wait(() => document.querySelector('[aria-label^="Usar Compra para el cierre A:"]')?.disabled);
  assert(await label('Precio cierre A').inputValue() === '100.1', 'A changed unit disables market selection and retains the entered price');
  assert((await factorPnl.innerText()).includes('—') && (await page.locator('.ro-detail > .ro-issue').innerText()).includes('Cambió la unidad'), 'P&L flags a genuine quote unit change');
  checks.push('Close quotes and P&L agree on rounding at the saved factor precision and on genuine quote unit changes');

  const correctionId = await reviewOpen('BMA/GGAL', '100', '50');
  await label('Precio cierre A').fill('110'); await label('Precio cierre B').fill('45');
  await click(button('Cerrar 25%')); await reviewWaitHistory(correctionId, [[25], [50]]);
  await click(button('Cerrar todo')); await reviewWaitHistory(correctionId, [[25, 75], [50, 150]]);
  const history = page.getByRole('region', { name: 'Historial de cierres', exact: true });
  const closeRows = history.getByRole('listitem');
  const older = closeRows.nth(1);
  assert(await closeRows.count() === 2 && (await older.innerText()).includes('BMA') && (await older.innerText()).includes('GGAL'), 'Each close has one row with both legs');
  const originalClose = await reviewRecord(correctionId);
  const closedPnl = await realizedRow.innerText();
  const closeEditor = page.getByRole('form', { name: 'Editar cierre', exact: true });
  const editOlder = older.getByRole('button', { name: 'Editar cierre', exact: true });
  await click(editOlder);
  await closeEditor.getByLabel('Precio A', { exact: true }).fill('115');
  await closeEditor.getByRole('button', { name: 'Cancelar', exact: true }).press('Enter');
  assert(JSON.stringify(await reviewRecord(correctionId)) === JSON.stringify(originalClose), 'Cancel leaves the close record unchanged');
  assert(await editOlder.evaluate(button => button === document.activeElement), 'Cancel returns keyboard focus to Editar cierre');
  await click(editOlder);
  await closeEditor.getByLabel('Cantidad A · nominales', { exact: true }).fill('26');
  await click(button('Guardar cierre'));
  assert(await closeEditor.isVisible() && JSON.stringify(await reviewRecord(correctionId)) === JSON.stringify(originalClose), 'Correction cannot close more than the operation total');
  await closeEditor.getByLabel('Cantidad A · nominales', { exact: true }).fill('20');
  await closeEditor.getByLabel('Cantidad B · nominales', { exact: true }).fill('40');
  await closeEditor.getByLabel('Precio A', { exact: true }).fill('1.12e2');
  await closeEditor.getByLabel('Precio B', { exact: true }).fill('.45');
  await click(button('Guardar cierre'));
  await reviewWaitHistory(correctionId, [[20, 75], [40, 150]]);
  await page.getByText('Cierre actualizado.', { exact: true }).waitFor();
  const corrected = await reviewRecord(correctionId);
  assert(corrected.legs[0].exits[0].price === 112 && corrected.legs[1].exits[0].price === .45 &&
    corrected.legs[0].exits[0].at === originalClose.legs[0].exits[0].at &&
    JSON.stringify(corrected.legs.map(l => l.exits[1])) === JSON.stringify(originalClose.legs.map(l => l.exits[1])), 'Edit accepts numeric input formats and preserves original time and later closes');
  assert(await realizedRow.innerText() !== closedPnl, 'The realized P&L changes after correction');
  const correctionRow = page.locator(`.ro-operations-table tr[data-row-id="${correctionId}"]`);
  assert((await correctionRow.innerText()).includes('Parcial') && (await correctionRow.innerText()).includes('5,00 / 10,00'), 'Editing a full close can reopen both legs');
  const newer = closeRows.first();
  await click(newer.getByRole('button', { name: 'Eliminar cierre', exact: true }));
  const confirmation = page.getByRole('group', { name: 'Confirmar eliminación del cierre' });
  await click(confirmation.getByRole('button', { name: 'Cancelar', exact: true }));
  assert(JSON.stringify(await reviewRecord(correctionId)) === JSON.stringify(corrected), 'Canceling confirmation leaves both legs in the ledger');
  await click(newer.getByRole('button', { name: 'Eliminar cierre', exact: true }));
  await click(button('Confirmar eliminación'));
  await reviewWaitHistory(correctionId, [[20], [40]]);
  await page.getByText('Cierre eliminado del registro local.', { exact: true }).waitFor();
  assert((await correctionRow.innerText()).includes('80,00 / 160,00'), 'Deleting the latest close restores exactly its quantities');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Configuración' }).click(); await click(button('Ratios'));
  await click(page.getByRole('button', { name: /^3 · Operaciones abiertas/ }));
  await click(correctionRow.getByRole('button', { name: 'Detalle', exact: true }));
  assert(await closeRows.count() === 1 && (await closeRows.first().innerText()).includes('112,00'), 'Edited prices and deleted closes persist after reload');
  checks.push('Recorded closes group both legs and support cancellation, validated edits and confirmed deletion with persisted balances and P&L');

  assert((await closeRows.first().innerText()).includes('Ratio de cierre'), 'Common ratios show the ratio calculated from the historical closing prices');

  await click(button('1 · Monitor'));
  await click(comparison.getByRole('button', { name: 'Abrir operación', exact: true }));
  const lastC = page.getByRole('button', { name: /^Usar último C/ });
  await lastC.click();
  await label('Fecha/hora de apertura · Argentina').fill('2026-01-02T10:00');
  assert(await label('Precio de entrada A').inputValue() === '' && await label('Precio de entrada B').inputValue() === '',
    'Changing the opening date clears current market prefills');
  await click(button('Long AL30 / Short AL30D'));
  assert(await label('Precio de entrada A').inputValue() === '' && await label('Precio de entrada B').inputValue() === '' &&
    await lastC.isDisabled() && await button('Usar último de A').isDisabled() && await button('Usar Venta nivel 1 de A').isDisabled(),
    'Historical dates prevent prefilling or copying present-market prices');
  await label('Precio de entrada A').fill('80000'); await label('Precio de entrada B').fill('50');
  const entryC = label('Precio C al abrir');
  assert(await entryC.inputValue() === '' && await label('Registrar C como tercera pata').count() === 0, 'Spot C requires an explicit quote and is a benchmark');
  await click(button('Abrir operación'));
  assert(await entryC.isVisible(), 'Entry with a missing C is blocked');
  const referencePanel = page.getByRole('region', { name: /^Referencia C/ });
  const placement = () => referencePanel.evaluate(panel => {
    const grid = panel.parentElement;
    const [a, b] = [...grid.querySelectorAll(':scope > .ro-leg')].map(leg => leg.getBoundingClientRect());
    const c = panel.getBoundingClientRect();
    const data = grid.querySelector(':scope > .ro-entry-costs');
    const d = data.getBoundingClientRect();
    const sameRow = (x, y) => Math.abs(x.top - y.top) < 2;
    return {
      four: a.right <= b.left && b.right <= c.left && c.right <= d.left && sameRow(a, b) && sameRow(b, c) && sameRow(c, d),
      two: c.top >= Math.max(a.bottom, b.bottom) && c.right <= d.left && sameRow(c, d),
      stack: c.top >= Math.max(a.bottom, b.bottom) && d.top >= c.bottom,
      inlineControls: !!data.querySelector('[type="submit"]') &&
        [...grid.querySelectorAll(':scope > .ro-leg')].every(leg => !!leg.querySelector('.ro-sizing-leg input')),
    };
  });
  const desktop = await placement();
  assert(desktop.four && desktop.inlineControls, 'A, B, C and data align in four columns with costs and submission inside their cards');
  await page.setViewportSize({ width: 1024, height: 950 });
  assert((await placement()).two, 'At intermediate widths the four cards form two rows');
  await page.setViewportSize({ width: 760, height: 950 });
  assert((await placement()).stack, 'At narrow widths the four cards stack in order');
  await entryC.focus();
  await page.keyboard.press('Tab');
  assert(await label('Objetivo de brecha (%)').evaluate(el => document.activeElement === el && el.matches(':focus-visible')),
    'Keyboard reaches the spread target with visible focus at tablet width');
  assert(await entryC.evaluate(el => {
    const field = el.getBoundingClientRect(), area = el.closest('section').getBoundingClientRect(), style = getComputedStyle(el);
    return field.width > 40 && field.left >= area.left && field.right <= area.right &&
      field.right <= innerWidth && style.color !== style.backgroundColor;
  }), 'Historical C price remains legible and fits at tablet width');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await entryC.fill('1572.5'); await label('Ratio objetivo').fill('1800');
  await label('Objetivo de brecha (%)').fill('1');
  assert(await referencePanel.locator('output').first().innerText() === '1,75%', 'Entry spread uses the manual C');
  await click(button('Abrir operación')); await button('Registrar cierre').waitFor();
  const spotOp = (await book()).operations.at(-1);
  assert(spotOp.legs.length === 2 && spotOp.reference.entry === 1572.5 && spotOp.reference.goal.comparison === 'below' &&
    spotOp.openedAt === '2026-01-02T13:00:00.000Z' && (await book()).schema === 4, 'Manual historical spot, date and independent goals persist in a two-leg operation');
  await page.getByText('Objetivo de brecha ≤ 1,00% · pendiente', { exact: true }).last().waitFor();
  const pnlBeforeReferenceMove = await page.locator('.ro-detail .ro-pnl-lines').innerText();
  await page.evaluate(() => { const spot = mainStore.securityStore.securities.find(s => s.id === 'rx_DDF_DLR_SPOT'); spot.md.lst = 1600; spot.md.seq++; });
  await page.getByText('Objetivo de brecha ≤ 1,00% · alcanzado', { exact: true }).last().waitFor();
  assert(await page.locator('.ro-detail .ro-pnl-lines').innerText() === pnlBeforeReferenceMove, 'A change in spot alone can reach the spread goal while leaving P&L identical');
  await lastC.click();
  await label('Fecha/hora del cierre · Argentina').fill('2026-01-05T10:00');
  assert(await lastC.isDisabled() && await closeQuote('Último', 'A').isDisabled() &&
    await label('Precio C al cerrar').inputValue() === '', 'Historical close requires its own C and disables market quote copying');
  await label('Precio cierre A').fill('79000'); await label('Precio cierre B').fill('50');
  assert(await button('Cerrar todo').isDisabled(), 'Missing closing C blocks saving a close');
  await label('Precio C al cerrar').fill('1580');
  await click(button('Cerrar todo')); await history.waitFor();
  assert((await history.innerText()).includes('Brecha de cierre · 0,00%'), 'Historical close shows the gap using its own C');
  await click(history.getByRole('button', { name: 'Editar cierre', exact: true }));
  await closeEditor.getByLabel('Precio referencia C', { exact: true }).fill('1600');
  await click(closeEditor.getByRole('button', { name: 'Guardar cierre', exact: true }));
  await history.getByText('Brecha de cierre · -1,25%', { exact: true }).waitFor();
  checks.push('Historical official benchmark can be entered and corrected, and its live objective is independent from A/B P&L');

  await click(button('1 · Monitor'));
  await choose('Instrumento A', 'AL30'); await choose('Instrumento B', 'AL30D');
  await label('Agregar referencia C').check();
  await choose('Referencia C · ej. DLR/SPOT', 'DLR/DIC26');
  await label('Dividir Referencia C por 100').check();
  await click(button('Agregar par'));
  const futureComparison = page.locator('.ro-monitor-table tr').filter({ hasText: 'MEP AL30 vs (DLR/DIC26 ÷ 100)' });
  await click(futureComparison.getByRole('button', { name: 'Abrir operación', exact: true }));
  await label('Fecha/hora de apertura · Argentina').fill('2026-01-02T11:00');
  await label('Precio de entrada A').fill('80000'); await label('Precio de entrada B').fill('50');
  await label('Precio C al abrir').fill('160000');
  await label('Registrar C como tercera pata').check();
  await label('Sentido C').selectOption('-1'); await label('Contratos C').fill('2');
  await label('Factor monetario C').fill('10'); await label('DDMM C (%)').fill('0');
  await click(button('Abrir operación')); await button('Registrar cierre').waitFor();
  const future = (await book()).operations.at(-1);
  assert(future.legs.length === 3 && future.legs[2].side === -1 && future.legs[2].entry === 160000 && future.reference.divisor === 100 &&
    (await page.locator('.ro-detail-ratio').innerText()).includes('0,00%'), 'Third leg retains its raw entry price and the divisor applies to the spread only');
  await label('Fecha/hora del cierre · Argentina').fill('2026-01-05T11:00');
  await label('Precio cierre A').fill('80000'); await label('Precio cierre B').fill('50'); await label('Precio cierre C').fill('158000');
  await label('Cantidad cierre C').fill('1');
  assert(await label('Cantidad cierre A').inputValue() === '50' && await label('Cantidad cierre B').inputValue() === '50', 'A/B close in proportion to the manually selected number of contracts');
  await click(button('Registrar cierre')); await history.getByText('Brecha de cierre · 1,27%', { exact: true }).waitFor();
  assert((await book()).operations.at(-1).legs[2].exits[0].quantity === 1, 'Partial closing quantities include C');
  await label('Ingresar cantidades por pata').check();
  await label('Fecha/hora del cierre · Argentina').fill('2026-01-05T12:00');
  await label('Precio cierre C').fill('159000');
  await label('Cantidad cierre C').fill('1');
  assert(await label('Cantidad cierre A').inputValue() === '' && await label('Cantidad cierre B').inputValue() === '',
    'Independent mode leaves A and B amounts blank when only C closes');
  await click(button('Registrar cierre'));
  await reviewWaitHistory(future.id, [[50], [50], [1, 1]]);
  const separateClose = (await book()).operations.at(-1);
  assert(separateClose.legs[2].exits[1].price === 159000 && separateClose.legs[2].exits[1].at === '2026-01-05T15:00:00.000Z',
    'Independent C close records its own execution and timestamp');
  await label('Ingresar cantidades por pata').check();
  await label('Fecha/hora del cierre · Argentina').fill('2026-01-05T13:00');
  await label('Precio cierre A').fill('80000'); await label('Precio cierre B').fill('50');
  await label('Cantidad cierre A').fill('10');
  assert(await button('Registrar cierre').isDisabled(), 'A and B remain paired when each has an open balance');
  await label('Cantidad cierre B').fill('10');
  assert(await button('Registrar cierre').isDisabled(), 'The paired exit requires a benchmark when C is already flat');
  await label('Precio C al cerrar').fill('160000');
  await click(button('Registrar cierre'));
  await reviewWaitHistory(future.id, [[50, 10], [50, 10], [1, 1]]);
  await history.getByText('Brecha de cierre · 0,00%', { exact: true }).waitFor();
  checks.push('Four opening cards align on desktop, reflow with keyboard focus and support independent future closes');
  await click(button('1 · Monitor')); await click(button('Quitar par MEP AL30 vs (DLR/DIC26 ÷ 100)'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Configuración' }).click(); await click(button('Ratios'));
  await click(page.getByRole('button', { name: /^3 · Operaciones abiertas/ }));
  const futureRow = page.locator('.ro-operations-table tr').filter({ hasText: 'DLR/DIC26' });
  await click(futureRow.getByRole('button', { name: 'Detalle', exact: true }));
  await history.getByText('Brecha de cierre · 1,27%', { exact: true }).waitFor();
  assert((await book()).operations.at(-1).reference.instrument.id === future.reference.instrument.id, 'Operations retain their contract and spread after monitor removal and refresh');
  checks.push('Historical future can open as a third leg, preserve C/100, close proportionally and retain all three legs independently of the monitor');

  return { checks, count: checks.length, productionBundle: true, syntheticOnly: true };
}
