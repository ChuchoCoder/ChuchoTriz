// Called by run.mjs through the shared Playwright MCP. Only the owned local fixture.
async (page, group) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Local regression fixture required');
  const cases = [];
  const b = name => page.getByRole('button', { name, exact: true });
  const label = name => ['Cantidad', 'Cantidad a mostrar', 'Precio', 'Instrumento'].includes(name)
    ? page.locator('#MiniOrderForm').getByLabel(name, { exact: true }) : page.getByLabel(name, { exact: true });
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const pass = (id, detail) => cases.push({ id, status: 'PASS', detail });
  const open = () => page.getByRole('link', { name: /Configuración/ }).click();
  const value = async (name, expected) => {
    try { await page.waitForFunction(({ name, expected }) => [...document.querySelectorAll('input')].some(e => e.getAttribute('aria-label') === name && e.value === expected), { name, expected }); }
    catch { throw Error(`${name}: expected ${expected}, got ${await label(name).inputValue()}`); }
  };
  const field = async (name, text) => { await label(name).fill(text); await label(name).press('Tab'); };
  const selectCall = () => b('Comprar DEMO CALL 100 en simulación').click();
  const edit = async (name, text) => { await b(`Editar ${name}`).click(); await label(name).fill(text); await label(name).press('Enter'); };
  const pnl = () => page.locator('.ct-sim-inspect output').first().innerText().then(text => Number(text.replace(/\s*ARS$/, '').replaceAll('.', '').replace(',', '.').replace('−', '-')));
  const reloadPosition = async () => { await b('Recargar tenencia').click(); await b('Cargando posición…').waitFor({ state: 'hidden' }); };
  const loadPosition = async () => {
    await b('Posición actual').click();
    await b('Recargar tenencia').waitFor();
    await value('Cantidad posición CALL 100', '+2');
  };
  const reset = async () => {
    await page.goto(page.url());
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('link', { name: /Configuración/ }).waitFor();
  };
  await reset();
  if (group === 'opening') {
    for (let i = 0; i < 2; i++) {
      await open();
      equal(await page.getByRole('region', { name: 'Configuración de ChuchoTriz', exact: true }).count(), 1, 'One panel');
      await b('Cantidades rápidas').click(); await b('Simulador de opciones').click();
      await b('Volver a Matriz').click();
    }
    pass('SM-01', 'Open/close/reopen, one panel, tools coexist');
  } else if (group === 'presets') {
    await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    const raw = 'AL30 100 200/20 300/R10\nGD30 400';
    await label('Presets RAW').fill(raw); await b('Guardar cambios').click();
    await page.getByText('Cambios guardados', { exact: false }).waitFor();
    await page.reload(); await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    equal((await label('Presets RAW').inputValue()).trim(), raw, 'RAW survives reload');
    await label('Presets RAW').fill('AL30 nope'); await b('Guardar cambios').click();
    assert(await page.getByRole('alert').count() > 0, 'Invalid RAW rejected');
    await page.reload(); await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    equal((await label('Presets RAW').inputValue()).trim(), raw, 'Invalid edit did not replace saved book');
    await b('Volver a Matriz').click();
    const ticket = page.locator('#MiniOrderForm');
    await ticket.getByRole('button', { name: '200/20', exact: true }).click();
    equal(await label('Cantidad').inputValue(), '200', 'Fixed preset quantity');
    equal(await label('Cantidad a mostrar').inputValue(), '20', 'Fixed display quantity');
    await ticket.getByRole('button', { name: '300/R10', exact: true }).click();
    const shown = Number(await label('Cantidad a mostrar').inputValue());
    assert(shown === 30, 'Random displayed quantity inside documented range');
    await ticket.getByRole('button', { name: '200/20', exact: true }).click();
    await label('Instrumento').fill('GD30 (CI)'); await label('Cantidad').fill(''); await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '400');
    await label('Instrumento').fill('AL30 (CI)'); await label('Cantidad').fill(''); await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '200');
    pass('SM-02/RG-01', 'RAW valid/invalid, reload, fixed/random display, per-instrument last preset');
    await page.evaluate(() => {
      const old = document.getElementById('MiniOrderForm'); const next = old.cloneNode(true);
      next.querySelector('#root-chuchotriz')?.remove(); next.querySelector('#cantidad').value = '';
      window.ctOldTicket = old; old.replaceWith(next); next.querySelector('#precio').focus();
    });
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '200');
    equal(await page.locator('#root-chuchotriz').count(), 1, 'One mounted preset panel');
    await ticket.getByRole('button', { name: 'Limpiar', exact: true }).click();
    equal(await label('Cantidad').inputValue(), '', 'Clear does not immediately reapply');
    await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '100');
    await page.evaluate(() => {
      const quote = document.createElement('button'); quote.className = 'PriceCell'; quote.textContent = 'Cotización ficticia';
      quote.onclick = () => document.getElementById('precio').focus(); document.querySelector('main').append(quote);
    });
    await b('Cotización ficticia').click();
    await page.waitForFunction(() => document.activeElement === document.getElementById('cantidad'));
    await label('Precio').click();
    equal(await page.evaluate(() => document.activeElement.id), 'precio', 'Direct price click keeps focus');
    pass('SM-03', 'Form remount keeps preset, Clear forgets it, quote redirects focus and direct click does not');
  } else if (group === 'quotes') {
    await open();
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.md.ask = undefined; c.md.asz = undefined; c.md.lst = 9; c.md.seq++; });
    await page.waitForFunction(() => document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]').innerText.includes('—'));
    await selectCall(); equal(await b('Editar Precio pata 1').innerText(), '9', 'Missing ask uses last trade');
    await selectCall(); equal(await b('Quitar pata 1').count(), 0, 'Repeated quote deselects');
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.md.lst = undefined; c.md.seq++; });
    // Wait on the public last-price cell, then choose the unavailable quote.
    await label('Cambiar columna Volumen nominal de Calls').selectOption('last');
    await page.waitForFunction(() => document.querySelector('[aria-label="Último precio operado DEMO CALL 100"]').textContent === '—');
    await selectCall(); equal(await b('Editar Precio pata 1').innerText(), '—', 'Missing ask and last require manual premium');
    const load = b('Cargar Op. · compra de DEMO CALL 100 en el Mini Order Form');
    assert(await load.isDisabled(), 'Cannot preload absent quote');
    await b('Fijar 10 contratos').click();
    await b('Vender DEMO PUT 100 en simulación').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+10', '−1'], 'Call buy and put sell sides');
    pass('SM-04', 'Call/put selection, deselection, last-trade fallback, missing premium and blocked preload');
    const strike = value => page.locator(`tr[data-option-strike="${value}"] th[scope="row"]`);
    const dragQuote = async (source, target, { highlight, cancel = false } = {}) => {
      await source.scrollIntoViewIfNeeded();
      await target.scrollIntoViewIfNeeded();
      const from = await source.boundingBox(), to = await target.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      try {
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
        if (highlight) await page.locator(`tr[data-option-strike="${highlight}"] th.ct-opt-strike-target`).waitFor();
        if (cancel) await page.keyboard.press('Escape');
      } finally {
        await page.mouse.up();
      }
    };
    const ask100 = b('Comprar DEMO CALL 100 en simulación'), ask120 = b('Comprar DEMO CALL 120 en simulación');
    const bid100 = b('Vender DEMO PUT 100 en simulación'), bid90 = b('Vender DEMO PUT 90 en simulación');
    equal(await ask120.getAttribute('draggable'), 'false', 'Unselected quote cannot start a drag');
    await dragQuote(ask100, strike(120), { highlight: 120, cancel: true });
    equal(await ask100.getAttribute('aria-pressed'), 'true', 'Escape leaves the source selected');
    equal(await ask120.getAttribute('aria-pressed'), 'false', 'Escape cancels the move');
    equal(await page.locator('.ct-opt-strike-target').count(), 0, 'Escape clears the highlight');
    await dragQuote(ask100, b('Vender DEMO PUT 120 en simulación'));
    equal(await ask100.getAttribute('aria-pressed'), 'true', 'Other type and side cannot receive the drag');
    await dragQuote(ask100, ask120, { highlight: 120 });
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'ASK moves to higher strike');
    equal(await ask100.getAttribute('aria-pressed'), 'false', 'Original quote is deselected');
    equal(await b('Editar Contratos pata 1').innerText(), '+10', 'Move retains selected quantity');
    equal(await b('Editar Precio pata 1').innerText(), '4,1', 'Move uses destination ASK');
    await dragQuote(ask120, strike(100));
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'Drop rejected when the destination has no ASK');
    await page.evaluate(() => {
      const put = window.mainStore.securityStore.options.find(option => option.id === 'put-100');
      put.md.bid = put.md.ask;
      put.md.seq++;
    });
    await page.waitForFunction(() => document.querySelector('[aria-label="Vender DEMO PUT 100 en simulación"]').title.includes('cerrado o cruzado'));
    assert(await b('Comprar DEMO PUT 100 en simulación').isDisabled(), 'Cannot select the other side of a crossed book');
    await bid100.hover();
    assert(await b('Cargar Op. · venta de DEMO PUT 100 en el Mini Order Form').isDisabled(), 'Cannot preload a crossed quote');
    await dragQuote(bid100, strike(90), { highlight: 90 });
    equal(await bid90.getAttribute('aria-pressed'), 'true', 'BID moves to lower strike');
    equal(await b('Editar Precio pata 2').innerText(), '5,9', 'Move uses destination BID');
    await b('Vender DEMO CALL 110 en simulación').click();
    await dragQuote(ask120, strike(110));
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'Drop rejected when the contract already has a leg');
    equal(await b('Vender DEMO CALL 110 en simulación').getAttribute('aria-pressed'), 'true', 'Existing leg is preserved');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    await page.getByText('VI por pata', { exact: true }).click();
    equal(await b('Editar VI pata 1').innerText(), '45,00', 'Move uses destination IV');
    pass('SM-04-drag', 'Native BID/ASK drag reprices the leg, handles crossed source and Escape, and rejects mismatched, missing or occupied targets');
  } else if (group === 'columns') {
    await open(); await b('Configurar cadena de opciones').click();
    await page.getByRole('checkbox', { name: 'Volumen nominal', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Mid', exact: true }).check();
    await b('Mover Mid hacia el borde').click(); await b('Listo').click();
    const columns = () => page.locator('select[aria-label^="Cambiar columna"]').evaluateAll(es => es.map(e => e.value));
    const expected = await columns();
    assert(expected.includes('mid') && !expected.includes('volume'), 'Columns changed');
    equal(expected.slice(0, expected.length / 2), expected.slice(expected.length / 2).reverse(), 'Mirrored call/put columns');
    await page.reload(); await open(); equal(await columns(), expected, 'Order and visibility persist');
    await label('Cambiar columna Mid de Calls').selectOption('volume');
    equal(await label('Cambiar columna Volumen nominal de Puts').inputValue(), 'volume', 'Header change mirrored');
    for (const fixed of ['BID · Vender', 'ASK · Comprar', 'VI', 'Strike']) assert(await page.getByRole('columnheader', { name: fixed, exact: true }).count() > 0, `Fixed ${fixed}`);
    pass('SM-05', 'Hide/show/reorder, reload persistence, mirrored header replacement and fixed columns');
  } else if (group === 'tooltip') {
    await open(); const trigger = b('VI 35,00 % · DEMO CALL 100');
    await trigger.click();
    await page.getByRole('tooltip').getByText('Probabilidad teórica al vencimiento', { exact: true }).waitFor();
    const text = (await page.getByRole('tooltip').innerText()).replace(/\s/g, ' ');
    for (const term of ['48 %', '52 %', 'Delta', 'Theta', 'Gamma', 'Vega']) assert(text.includes(term), `Tooltip ${term}`);
    await page.keyboard.press('Escape'); equal(await page.getByRole('tooltip').count(), 0, 'Escape closes');
    await trigger.click(); await page.getByRole('heading', { name: 'ChuchoTriz', exact: true }).click();
    equal(await page.getByRole('tooltip').count(), 0, 'Outside click closes');
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.impliedVolatility = undefined; c.md.seq++; });
    await b('VI sin dato · DEMO CALL 100').click();
    await page.getByRole('tooltip').getByText(/Probabilidades y griegas teóricas no disponibles/).waitFor();
    equal(await page.getByRole('tooltip').getByText('Delta', { exact: true }).count(), 0, 'No invented Greeks without IV');
    pass('SM-06', 'IV tooltip values, Escape/outside dismissal, missing-IV state');
  } else if (group === 'preload') {
    for (const [side, verb, price] of [['buy', 'Comprar', '8.1'], ['sell', 'Vender', '7.9']]) {
      await reset(); await open();
      await b(`${verb} DEMO CALL 100 en simulación`).click();
      await b('Fijar 10 contratos').click();
      await b(`Cargar Op. · ${side === 'buy' ? 'compra' : 'venta'} de DEMO CALL 100 en el Mini Order Form`).click();
      await page.waitForFunction(price => document.querySelector('#cantidad').value === '10' && Number(document.querySelector('#precio').value.replace(',', '.')) === Number(price), price);
      equal(await label('Instrumento').inputValue(), 'DEMO CALL 100', 'Native ticket instrument');
      await page.locator('#MiniOrderForm').getByRole('button', { name: 'Limpiar', exact: true }).click();
    }
    await open(); await b('Editar Precio pata 1').click(); await label('Precio pata 1').fill('1'); await label('Precio pata 1').press('Enter');
    await b('Cargar venta de la pata 1 en el Mini Order Form').click();
    await page.waitForFunction(() => document.querySelector('#precio').value === '1' && document.querySelector('#cantidad').value === '10');
    await page.locator('#MiniOrderForm').getByRole('button', { name: 'Limpiar', exact: true }).click();
    pass('SM-10', 'BID/ASK preload quantity 10 and edited leg price; only fake ticket, cleared');
  } else if (group === 'position') {
    await open(); await loadPosition();
    await value('Cantidad posición CALL 110', '−1');
    await value('Prima histórica CALL 100', '');
    await b('Cotizaciones').click(); await selectCall();
    await b('Posición actual').click(); await b('Cotizaciones').click();
    equal(await b('Editar Contratos pata 1').innerText(), '+1', 'Adjustment kept across modes');
    pass('SM-08', 'Imported +2/-1 position, unknown premiums blank, adjustments survive mode switches');
  } else if (group === 'operations') {
    await open(); await b('Operaciones de opciones').click(); await b('Actualizar desde Matriz').click();
    await b('Copiar Calls y Puts').waitFor();
    await page.getByRole('combobox', { name: /Formato regional/ }).selectOption('es-AR');
    const expiration = await page.evaluate(() => {
      const date = window.mainStore.securityStore.options[0].refData.maturityDateStr;
      return `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}`;
    });
    await page.evaluate(() => { window.ctCopyOriginal = navigator.clipboard.writeText; window.ctCopy = ''; navigator.clipboard.writeText = async text => { window.ctCopy = text; }; });
    try {
      await b('Copiar Calls y Puts').click(); await page.waitForFunction(() => window.ctCopy.length > 0);
      const copy = await page.evaluate(() => window.ctCopy);
      const data = copy.split('\n').filter(line => line.includes('\t')).map(line => line.split('\t'));
      equal(data, [[expiration, '6', '100', '16'], [expiration, '-3', '100', '12'], [expiration, '2', '100', '10'], [expiration, '-1', '100', '9']], 'Copied expirations, signed quantities, strikes, premiums');
      assert(copy.includes('OPERACIONES CALLS') && copy.includes('OPERACIONES PUTS'), 'Both sections');
    } finally { await page.evaluate(() => { navigator.clipboard.writeText = window.ctCopyOriginal; delete window.ctCopyOriginal; delete window.ctCopy; }); }
    pass('SM-09', 'Real reader + UI over synthetic executions; clipboard verified without changing system clipboard');
  } else if (group === 'analysis') {
    await open(); await selectCall();
    const outputs = () => page.locator('.ct-sim-inspect output').allTextContents();
    const before = await outputs(); await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    equal(await outputs(), before, 'Shared analysis results');
    equal(await page.locator('.ct-sim-scenario-results tbody tr').count(), 25, '25 scenarios');
    await b('Fecha Vencimiento').click(); const expiry = await outputs(); equal(expiry[0], expiry[1], 'Theory equals payoff at expiry');
    const path = () => page.locator('.ct-sim-chart .ct-sim-expiry-line').getAttribute('d');
    const auto = await path(); await b('Ampliar rango de precios').click(); assert(await path() !== auto, 'Zoom changes curve coordinates');
    await b('Ajustar').click(); equal(await path(), auto, 'Fit restores auto extent');
    await page.getByText('Supuestos de valuación', { exact: true }).click();
    assert((await label('Tasa automática de valuación').innerText()).includes('Caución ARS 7 días'), 'Automatic caucion reference');
    await label('Origen de la tasa').selectOption('manual'); await field('Tasa anual continua %', '30');
    await label('Origen de la tasa').selectOption('automatic'); await label('Origen de la tasa').selectOption('manual');
    equal(await label('Tasa anual continua %').inputValue(), '30', 'Manual rate survives switching');
    pass('SM-07/RG-08', 'Shared views, 25 scenarios, expiry, zoom/fit and automatic/manual rate');
  } else if (group === 'oracle') {
    await open(); await b('+ Pata manual').click();
    await edit('Precio pata 1', '8'); await edit('Strike pata 1', '100');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    await page.getByText('Supuestos de valuación', { exact: true }).click();
    await field('Precio de referencia', '100'); await field('Factor monetario por contrato', '100');
    await field('Gastos de entrada totales', '0'); await b('Fecha Vencimiento').click();
    for (const [price, expected] of [['90', -800], ['100', -800], ['110', 200]]) { await field('Precio del escenario', price); equal(await pnl(), expected, `Long call at ${price}`); }
    await page.getByRole('tab', { name: 'Armado', exact: true }).click(); await edit('Contratos pata 1', '-1');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    for (const [price, expected] of [['90', 800], ['100', 800], ['110', -200]]) { await field('Precio del escenario', price); equal(await pnl(), expected, `Short call at ${price}`); }
    pass('RG-04', 'Independent manual call payoff oracle at 90/100/110, long and short');
  } else if (group === 'editing') {
    await open(); await selectCall();
    const quantities = await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents();
    const premium = await b('Editar Precio pata 1').innerText();
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    const before = await page.locator('.ct-sim-inspect output').allTextContents();
    await page.getByText('VI por pata', { exact: true }).click(); await edit('VI pata 1', '45');
    const after = await page.locator('.ct-sim-inspect output').allTextContents();
    equal(after[0], before[0], 'Per-leg IV does not change expiry P&L');
    assert(after[1] !== before[1], 'Per-leg IV changes theoretical P&L');
    await page.getByRole('tab', { name: 'Armado', exact: true }).click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), quantities, 'IV preserves contracts');
    equal(await b('Editar Precio pata 1').innerText(), premium, 'IV preserves entry premium');
    await b('Quitar pata 1').click(); equal(await b('Quitar pata 1').count(), 0, 'Remove leg');
    pass('RG-03-editing', 'Per-leg IV changes only theoretical value; premium/quantity preserved; remove leg');
  } else if (group === 'accounting') {
    await open(); await loadPosition();
    await field('Prima histórica CALL 100', '8'); await field('Prima histórica CALL 110', '6');
    await field('Costo promedio por nominal', '90'); await field('Gastos de la posición', '40'); await field('Resultado realizado neto', '200');
    await label('Incluir posición actual en Análisis').check(); equal(await pnl(), 160, 'Position expiry includes premiums/nominals/costs/realized');
    await field('Nominales del subyacente', '200'); equal(await pnl(), 1160, 'Edited nominal quantity adds 1000 at spot');
    await reloadPosition(); await value('Nominales del subyacente', '100'); equal(await pnl(), 160, 'Reload restores broker quantity and saved cost');
    await b('Cotizaciones').click(); await selectCall();
    await label('Incluir posición actual en Análisis').uncheck(); equal(await pnl(), -810, 'Adjustment alone excludes historical costs');
    await label('Incluir posición actual en Análisis').check(); equal(await pnl(), -650, 'Position plus adjustment without duplicate costs');
    await page.reload(); await open(); await loadPosition();
    await value('Prima histórica CALL 100', '8'); await value('Prima histórica CALL 110', '6');
    await value('Costo promedio por nominal', '90'); await value('Gastos de la posición', '40'); await value('Resultado realizado neto', '200');
    pass('RG-05', 'Independent total 160, edited nominals 1160, isolated adjustment -810, combined -650, saved accounting survives reload');
  } else if (group === 'scope') {
    await open(); await loadPosition(); await field('Prima histórica CALL 100', '8');
    await page.evaluate(() => { window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed[0].detailedPositions[0].totalCurrentSize = 3; });
    await reloadPosition(); await value('Cantidad posición CALL 100', '+3'); await value('Prima histórica CALL 100', '8');
    await b('Ver aviso de prima histórica CALL 100').click(); await b('Confirmar prima histórica CALL 100').click();
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-SECOND'; });
    await reloadPosition(); await value('Prima histórica CALL 100', '');
    await field('Prima histórica CALL 100', '12');
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-NO-BROKER'; });
    await reloadPosition(); await value('Prima histórica CALL 100', '8');
    await page.evaluate(() => { window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed[0].detailedPositions[0].totalCurrentSize = -3; });
    await reloadPosition(); await value('Cantidad posición CALL 100', '−3'); await value('Prima histórica CALL 100', '');
    pass('RG-06', 'Changed quantity retains premium for review, account cost separation, side reversal clears premium');
    await reset();
    // Extend only the fake external catalogue/report with a second maturity.
    await page.evaluate(() => {
      const store = window.mainStore.securityStore;
      const maturity = new Date(); maturity.setDate(maturity.getDate() + 60);
      const stamp = `${maturity.getFullYear()}${String(maturity.getMonth() + 1).padStart(2, '0')}${String(maturity.getDate()).padStart(2, '0')}`;
      const next = store.options.map(option => ({ ...option, id: 'next-' + option.id, symbolStr: 'NEXT ' + option.symbolStr,
        fixSymbol: 'NEXT ' + option.fixSymbol, refData: { ...option.refData, maturityDateStr: stamp }, md: { ...option.md } }));
      store.options = [...store.options, ...next];
      const originalFind = store.findSecurityFromId, originalGet = store.getSecurity;
      store.findSecurityFromId = id => next.find(option => option.id === id) ?? originalFind(id);
      store.getSecurity = async id => next.find(option => option.id === id) ?? originalGet(id);
      window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed.push({ detailedPositions: [
        { tradingSymbol: 'NEXT DEMO FIX call 100', totalCurrentSize: 4, totalCollateralSize: 0 },
      ] });
    });
    await open(); await loadPosition(); await field('Prima histórica CALL 100', '8');
    const expiries = await label('Vencimiento de opciones').evaluate(e => [...e.options].map(o => o.value).filter(Boolean));
    equal(expiries.length, 2, 'Two fixture maturities');
    await b('Nueva simulación').click(); await label('Vencimiento de opciones').selectOption(expiries[1]);
    await b('Posición actual').click(); await value('Cantidad posición CALL 100', '+4'); await value('Prima histórica CALL 100', '');
    await field('Prima histórica CALL 100', '12');
    await b('Nueva simulación').click(); await label('Vencimiento de opciones').selectOption(expiries[0]); await b('Posición actual').click();
    await value('Prima histórica CALL 100', '8');
    pass('RG-06-chain', 'Distinct expirations do not inherit premiums; returning restores original chain cost');
  } else if (group === 'roll') {
    await open(); await loadPosition();
    await b('Rolar posición CALL 110').click(); await b('Rolar a 120').click(); await b('Usar mínimo sin débito').click();
    let dialog = page.getByRole('dialog');
    assert((await dialog.innerText()).includes('167,22 ARS'), 'Short roll net 167.22 with 0.2% fees');
    await field('Gastos del rolado (%)', '1'); assert((await dialog.innerText()).includes('156,1 ARS'), 'Short roll net 156.10 with 1% fees');
    await b('Cargar en Cotizaciones →').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+1', '−2'], 'Short roll closing and opening quantities');
    for (const name of ['Comprar DEMO CALL 110 en simulación', 'Vender DEMO CALL 120 en simulación'])
      equal(await b(name).getAttribute('draggable'), 'false', 'Roll legs are not draggable');
    assert(await label('Incluir posición actual en Análisis').isChecked(), 'Roll includes current position');
    await b('Limpiar ajustes').click(); await b('Posición actual').click();
    await b('Rolar posición CALL 100').click(); await b('Rolar a 110').click(); await b('Usar máximo sin débito').click();
    assert((await dialog.innerText()).includes('354,4 ARS'), 'Long roll net 354.40');
    await b('Cargar en Cotizaciones →').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['−2', '+2'], 'Long roll closing and opening quantities');
    await b('Limpiar ajustes').click(); await b('Posición actual').click();
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-120'); c.md.bsz = 0; c.md.seq++; });
    await b('Rolar posición CALL 110').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Rolar a 120"]')?.disabled);
    assert(await b('Cargar en Cotizaciones →').isDisabled(), 'Missing liquidity blocks loading');
    await page.keyboard.press('Escape'); equal(await page.getByRole('dialog').count(), 0, 'Roll dialog Escape');
    pass('RG-07', 'Bought/sold rolls, min/max financing, fees 0.2/1%, two legs, unavailable liquidity and Escape');
  } else if (group === 'limits') {
    await open(); await b('Elegir estrategia').click();
    await page.locator('[data-family-name="butterfly"]').click();
    const preview = await label('Patas de la plantilla').innerText();
    for (const expected of ['Compra 1× DEMO CALL 90', 'Venta 2× DEMO CALL 100', 'Compra 1× DEMO CALL 110']) assert(preview.includes(expected), 'Butterfly preview ' + expected);
    await page.locator('[data-family-name="butterfly"]').locator('..').locator('.ct-sim-strategy-apply').click();
    equal(await page.locator('.ct-sim-leg-strike').allTextContents(), ['90', '100', '110'], 'Preview/build strikes');
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+1', '−2', '+1'], 'Preview/build proportions');
    assert(await b('Bajar cantidades de toda la estrategia').isDisabled(), 'Ratio floor cannot go below one');
    await b('Limpiar patas').click(); await selectCall();
    assert(await b('Reducir contratos pata 1').isDisabled(), 'Leg cannot cross zero');
    await edit('Contratos pata 1', '10000000000');
    assert(await b('Aumentar contratos pata 1').isDisabled(), 'Upper quantity limit');
    await edit('Contratos pata 1', '1');
    for (let i = 0; i < 3; i++) await b('Subir strikes de toda la estrategia').click();
    assert(await b('Subir strikes de toda la estrategia').isDisabled(), 'Outer upper strike boundary');
    for (let i = 0; i < 6; i++) await b('Bajar strikes de toda la estrategia').click();
    assert(await b('Bajar strikes de toda la estrategia').isDisabled(), 'Outer lower strike boundary');
    pass('RG-02-limits', 'Preview/build correspondence, quantity floor/ceiling, upper/lower chain boundaries');
  } else if (group === 'reader-errors') {
    await open(); await b('Operaciones de opciones').click(); await b('Actualizar desde Matriz').click(); await b('Copiar Calls y Puts').waitFor();
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-SECOND'; });
    await page.getByRole('alert').filter({ hasText: 'Cambió la cuenta' }).waitFor();
    equal(await b('Copiar Calls y Puts').count(), 0, 'Stale account executions removed');
    await page.evaluate(() => { window.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => []; });
    await b('Actualizar desde Matriz').click(); await page.getByText('No hay ejecuciones de opciones disponibles en el reporte de Matriz.', { exact: true }).waitFor();
    await page.evaluate(() => { window.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => { throw Error('synthetic-private-marker'); }; });
    await b('Actualizar desde Matriz').click(); await page.getByRole('alert').filter({ hasText: 'No se pudo leer' }).waitFor();
    assert(!(await page.getByRole('alert').innerText()).includes('synthetic-private-marker'), 'Reader sanitizes errors');
    await b('Simulador de opciones').click();
    await page.evaluate(() => { window.mainStore.portfolioStore.getDetailedPositionReport = async () => { throw Error('synthetic-private-marker'); }; });
    await b('Posición actual').click(); await page.getByText('No se pudo actualizar la posición de Matriz. Revisá la conexión y volvé a intentar.', { exact: true }).waitFor();
    await page.evaluate(() => { const report = window.mainStore.portfolioStore.detailedPositionReport; report.types = []; window.mainStore.portfolioStore.getDetailedPositionReport = async () => report; });
    await reloadPosition(); await page.getByText('No hay posición abierta en esta cadena. Podés ingresar una posición manual.', { exact: true }).waitFor();
    pass('SM-08/SM-09-errors', 'Empty/error readers and stale-account clearing, sanitized failures and recovery');
  } else if (group === 'layout') {
    await open(); await selectCall();
    for (const width of [1024, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => document.querySelector('.ct-opt-chain-grid')?.clientWidth > 0);
      const layout = await page.locator('.ct-opt-chain-grid').evaluate(grid => {
        const width = grid.getBoundingClientRect().width;
        return { table: grid.querySelector('table').getBoundingClientRect().width, width,
          overlays: [...grid.querySelectorAll('.ct-opt-sigma-line')].map(e => e.getBoundingClientRect().width),
          pageOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(Math.abs(layout.table - layout.width) < 2, `Aligned grid at ${width}`);
      assert(layout.overlays.every(w => Math.abs(w - layout.width) < 2), `Aligned sigma at ${width}`);
      assert(!layout.pageOverflow, `No page overflow at ${width}`);
      await page.getByRole('region', { name: 'Cadena de opciones', exact: true }).evaluate(e => { e.scrollLeft = e.scrollWidth; e.scrollTop = e.scrollHeight; });
      await b('Configurar cadena de opciones').click(); await b('Listo').click();
    }
    const tab = page.getByRole('tab', { name: 'Armado', exact: true }); await tab.focus(); await page.keyboard.press('ArrowRight');
    equal(await page.getByRole('tab', { name: 'Análisis', exact: true }).getAttribute('aria-selected'), 'true', 'Keyboard switches analysis tab');
    await page.keyboard.press('ArrowLeft');
    await b('Elegir estrategia').click(); await page.keyboard.press('Escape');
    equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Elegir estrategia', 'Selector restores focus');
    pass('RG-10', '1024/1920 grid/overlay alignment, scroll, controls, keyboard tabs and Escape focus');
  } else {
    throw Error(`Unimplemented group ${group}`);
  }
  return { cases };
}
