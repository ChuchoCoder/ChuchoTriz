// Pass this function to the shared ChuchoTriz Playwright MCP browser_run_code_unsafe.
// Requires the regression scenario in tools/preview-free.mjs. Reuses the selected preview tab;
// never launches a browser, loads broker pages, or exercises execution APIs.
async (page) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Select the local simulator regression scenario first.');
  const checks = [], interactions = { pointer: 0, dom: 0 };
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const json = value => JSON.stringify(value, (_, item) => typeof item === 'number' && !Number.isFinite(item) ? String(item) : item);
  const equal = (actual, expected, label) => assert(json(actual) === json(expected), `${label}: ${json(actual)} != ${json(expected)}`);
  const label = name => page.getByLabel(name, { exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const visible = () => page.evaluate(() => document.visibilityState === 'visible');
  async function click(locator) {
    if (await visible()) { interactions.pointer++; await locator.click({ timeout: 5000 }); }
    else { interactions.dom++; await locator.evaluate(el => el.click()); }
  }
  async function doubleClick(locator) {
    if (await visible()) { interactions.pointer++; await locator.dblclick({ timeout: 5000 }); }
    else for (const detail of [1, 2]) {
      interactions.dom++;
      await locator.evaluate((el, detail) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })), detail);
    }
  }
  async function field(name, value) {
    const control = label(name);
    await control.evaluate((el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, String(value));
  }
  const quantities = () => page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents();
  const money = text => text.includes('∞') ? Infinity : Number(text.replace(/\s*(ARS|USD).*$/, '').replaceAll('.', '').replace(',', '.').replace('−', '-'));
  const outputs = async () => (await page.locator('.ct-sim-inspect output').allTextContents()).map(money);
  const maximum = async kind => money(await page.locator(`[aria-label="${kind} máxima del armado al vencimiento"] strong`).innerText());
  async function apply(family, direction = 'Long', kind = 'Call') {
    await click(button('Elegir estrategia'));
    const familyButton = page.locator(`[data-family-name="${family}"]`);
    await click(familyButton);
    const row = familyButton.locator('..');
    const variant = row.locator('.ct-sim-strategy-variant').first();
    if (await variant.innerText() !== direction) await click(variant);
    const kindButton = row.locator('.ct-sim-strategy-variant').nth(1);
    if (await kindButton.count() && await kindButton.innerText() !== kind) await click(kindButton);
    const applyButton = row.locator('.ct-sim-strategy-apply');
    assert(await applyButton.isEnabled(), `Template unavailable: ${family} ${direction} ${kind}`);
    await click(applyButton);
  }
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await click(page.getByRole('link', { name: 'Configuración' }));
    await click(button('Simulador de opciones'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.getAttribute('aria-label')?.startsWith('Comprar ') && !el.disabled), null, { polling: 100, timeout: 10000 });

    // Independent payoff oracles for all 24 selectable variants in the fixed chain.
    // [family, direction, kind, P&L at spot100, maxProfit, maxLoss]
    const cases = [
      ['option', 'Long', 'Call', -810, Infinity, 810], ['option', 'Short', 'Call', 790, 790, Infinity],
      ['option', 'Long', 'Put', -810, 9190, 810], ['option', 'Short', 'Put', 790, 790, 9210],
      ['vertical', 'Long', 'Call', -220, 780, 220], ['vertical', 'Short', 'Call', 180, 180, 820],
      ['vertical', 'Long', 'Put', -220, 780, 220], ['vertical', 'Short', 'Put', 180, 180, 820],
      ['butterfly', 'Long', 'Call', 360, 360, 640], ['butterfly', 'Short', 'Call', -440, 560, 440],
      ['butterfly', 'Long', 'Put', 360, 360, 640], ['butterfly', 'Short', 'Put', -440, 560, 440],
      ['ratio', 'Long', 'Call', -430, Infinity, 1430], ['ratio', 'Short', 'Call', 370, 1370, Infinity],
      ['ratio', 'Long', 'Put', -430, 7570, 1430], ['ratio', 'Short', 'Put', 370, 1370, 7630],
      ['strangle', 'Long', 'Call', -1220, Infinity, 1220], ['strangle', 'Short', 'Call', 1180, 1180, Infinity],
      ['straddle', 'Long', 'Call', -1620, Infinity, 1620], ['straddle', 'Short', 'Call', 1580, 1580, Infinity],
      ['iron-condor', 'Normal', 'Call', 360, 360, 640], ['iron-condor', 'Reversed', 'Call', -440, 560, 440],
      ['jade-lizard', 'Normal', 'Call', 770, 770, 8230], ['jade-lizard', 'Reversed', 'Call', 770, 770, Infinity],
    ];
    for (const [family, direction, kind, pnl, profit, loss] of cases) {
      await apply(family, direction, kind);
      equal((await outputs())[0], pnl, `${family}/${direction}/${kind} expiry`);
      equal(await maximum('Ganancia'), profit, `${family}/${direction}/${kind} maxProfit`);
      equal(await maximum('Pérdida'), loss, `${family}/${direction}/${kind} maxLoss`);
      checks.push(`payoff:${family}/${direction}/${kind}`);
    }

    await apply('butterfly');
    equal(await button('Subir cantidades de toda la estrategia').innerText(), '+', 'Global plus symbol');
    equal(await button('Bajar cantidades de toda la estrategia').innerText(), '−', 'Global minus symbol');
    await doubleClick(button('Subir cantidades de toda la estrategia'));
    equal(await quantities(), ['+11', '−22', '+11'], 'Global double click +10 ratio units');
    await doubleClick(button('Bajar cantidades de toda la estrategia'));
    equal(await quantities(), ['+1', '−2', '+1'], 'Global double click -10 ratio units');
    await doubleClick(button('Aumentar contratos pata 2'));
    equal(await quantities(), ['+1', '−12', '+1'], 'Leg double click +10 keeps sell side');
    await doubleClick(button('Reducir contratos pata 2'));
    equal(await quantities(), ['+1', '−2', '+1'], 'Leg double click -10');
    checks.push('quantity:single/double-click and ratios');
    await apply('vertical');
    await click(button('Subir strikes de toda la estrategia'));
    equal(await page.locator('.ct-sim-leg-strike').allTextContents(), ['110', '120'], 'Adjacent strikes up');
    await click(button('Bajar strikes de toda la estrategia'));
    equal(await page.locator('.ct-sim-leg-strike').allTextContents(), ['100', '110'], 'Adjacent strikes down');
    checks.push('strikes:atomic adjacent-contract shifts');

    await apply('iron-condor', 'Normal');
    await click(button('Tomar precio Mid de la estrategia'));
    equal((await outputs())[0], 400, 'Mid credit');
    await click(button('Tomar precio Opuesto de la estrategia'));
    equal((await outputs())[0], 440, 'Opposite credit');
    await field('Precio de entrada de la estrategia', 75);
    equal((await outputs())[0], 420, 'Interpolated credit');
    await click(button('Tomar precio Natural de la estrategia'));
    equal((await outputs())[0], 360, 'Natural credit');
    checks.push('entry:Natural/Mid/Opposite/interpolation');

    const geometry = await page.locator('.ct-sim-build-summary').evaluate(el => {
      const header = el.querySelector('.ct-sim-strategy-price > header'), grid = document.querySelector('.ct-opt-chain-grid');
      const gridTop = grid.getBoundingClientRect().top;
      return {
        metricTops: [...header.children].map(el => el.getBoundingClientRect().top),
        headerFits: header.scrollWidth <= header.clientWidth,
        rowHeights: [...el.querySelectorAll('.ct-sim-legs-card tbody tr')].map(el => el.getBoundingClientRect().height),
        chartHeight: el.querySelector('svg.ct-sim-chart').getBoundingClientRect().height,
        inspectTops: [...el.querySelector('.ct-sim-inspect').children].map(el => el.getBoundingClientRect().top),
        boundaries: [...grid.querySelectorAll('tr[data-option-strike]')].map(el => el.getBoundingClientRect().bottom - gridTop),
        sigmaY: [...grid.querySelectorAll('.ct-opt-sigma-line')].map(el => parseFloat(el.style.top)),
      };
    });
    assert(Math.max(...geometry.metricTops) - Math.min(...geometry.metricTops) < 1 && geometry.headerFits, 'Entry/maxima must fit one row');
    assert(geometry.rowHeights.every(height => height <= 28.5), 'Compact 28px leg rows');
    assert(geometry.chartHeight <= 191, 'Compact 190px quick chart');
    assert(Math.max(...geometry.inspectTops) - Math.min(...geometry.inspectTops) < 1, 'Quick outputs must fit one row');
    equal(geometry.sigmaY.length, 4, 'Four chain deviation references');
    assert(geometry.sigmaY.every(y => geometry.boundaries.some(boundary => Math.abs(boundary - y) <= 1)), 'Sigma lines must be between strike rows');
    assert(/^\d+,\d{2} %$/.test(await label('VI DEMO CALL 100').innerText()), 'Two-decimal IV');
    assert(await label('Theta teórico DEMO CALL 100').innerText() !== '—', 'Chain Theta');
    equal(await label('Extrínseco DEMO CALL 100').innerText(), '8', 'Chain extrinsic');
    const gradient = await page.locator('.ct-sim-chart').evaluate(svg => {
      const gradient = svg.querySelector('linearGradient[id$="-pnl"]'), stops = [...gradient.querySelectorAll('stop')];
      return { units: gradient.getAttribute('gradientUnits'), colors: stops.map(stop => stop.getAttribute('stop-color')), offset: Number(stops[1].getAttribute('offset')), secondOffset: Number(stops[2].getAttribute('offset')),
        zeroOffset: (Number(svg.querySelector('.ct-sim-zero').getAttribute('y1')) - Number(gradient.getAttribute('y1'))) / (Number(gradient.getAttribute('y2')) - Number(gradient.getAttribute('y1'))) };
    });
    equal(gradient.colors, ['var(--sim-profit)', 'var(--sim-profit)', 'var(--sim-loss)', 'var(--sim-loss)'], 'Green above zero/red below');
    equal(gradient.units, 'userSpaceOnUse', 'Gradient uses plot coordinates');
    equal(gradient.offset, gradient.secondOffset, 'Color transition has no blended interval');
    assert(Math.abs(gradient.offset - gradient.zeroOffset) < 1e-12, 'Color transition must match actual zero axis');
    checks.push('layout:one-row metrics, compact chart, IV/Theta/extrinsic, sigma boundaries, zero colors');

    const chart = page.locator('.ct-sim-chart');
    const point = await chart.evaluate(svg => {
      const box = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width, left = width < 500 ? 64 : 92, right = width < 500 ? 12 : 24;
      return { x: box.left + (left + .8 * (width - left - right)) * box.width / width, y: box.top + box.height / 2,
        tolerance: 2 * 50 / (width - left - right) };
    });
    if (await visible()) { interactions.pointer++; await page.mouse.click(point.x, point.y); }
    else { interactions.dom++; await chart.evaluate((svg, point) => svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: point.x, clientY: point.y })), point); }
    const pinned = money(await label('Precio fijado').innerText());
    assert(Math.abs(pinned - 115) <= point.tolerance, 'Click pins price within two rendered pixels');
    await chart.evaluate(svg => svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 })));
    equal(money(await label('Precio fijado').innerText()), pinned, 'Pointer move does not change price');
    const beforeAnalysis = await outputs();
    await click(page.getByRole('tab', { name: 'Análisis', exact: true }));
    equal(await outputs(), beforeAnalysis, 'Build/Analysis share results');
    assert(await label('Referencias de desvío estándar').count() === 1, 'Full sigma explanation remains in Analysis');
    assert(await page.locator('label').filter({ hasText: 'Moneda común' }).count() === 0, 'No currency selector');
    equal(await page.locator('.ct-sim-inspect input[type="range"]').count(), 0, 'No price slider below chart');
    await click(button('VI +5 pp'));
    assert((await outputs())[1] !== beforeAnalysis[1], 'IV scenario changes theoretical P&L');
    const expiryButton = button('Fecha Vencimiento');
    await click(expiryButton);
    const atExpiry = await outputs();
    equal(atExpiry[0], atExpiry[1], 'Theoretical equals intrinsic at expiry');
    await click(button('Precio 0%'));
    equal(money(await label('Precio fijado').innerText()), 100, 'Price scenario toggle');
    await click(page.getByRole('tab', { name: 'Armado', exact: true }));
    checks.push('analysis:shared state, scenarios, pinned price, no price slider');

    const saved = await quantities();
    await click(button('Cantidades rápidas'));
    await click(button('Simulador de opciones'));
    equal(await quantities(), saved, 'Existing quantities tab preserves strategy');
    checks.push('integration:presets tab and simulator coexist');

    // Only mutate the synthetic fixture's public quote, never real market state.
    await apply('option', 'Long', 'Call');
    await page.evaluate(() => {
      const contract = window.mainStore.securityStore.options.find(item => item.id === 'call-100');
      contract.md.bid = 7.7; contract.md.ask = 8.3; contract.md.seq++;
    });
    await page.waitForFunction(() => document.querySelector('[aria-label="Tomar precio Natural de la estrategia"]')?.title.includes('830 ARS'), null, { polling: 100, timeout: 12000 });
    equal(await label('Crédito o débito de la estrategia').innerText(), 'Débito 810 ARS', 'Quote refresh preserves selected entry');
    checks.push('quotes:refresh updates references without changing entry');
    await page.evaluate(() => {
      const contract = window.mainStore.securityStore.options.find(item => item.id === 'call-100');
      contract.md.bid = 12; contract.md.ask = 10; contract.md.seq++;
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]');
      return el?.disabled && el.title.includes('cerrado o cruzado');
    }, null, { polling: 100, timeout: 12000 });
    assert(await button('Vender DEMO CALL 100 en simulación').isDisabled(), 'Both crossed sides blocked');
    await page.evaluate(() => {
      const contract = window.mainStore.securityStore.options.find(item => item.id === 'call-100');
      contract.md.bid = 7.9; contract.md.ask = 8.1; contract.md.seq++;
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]');
      return el && !el.disabled;
    }, null, { polling: 100, timeout: 12000 });
    await page.evaluate(() => {
      const contract = window.mainStore.securityStore.options.find(item => item.id === 'call-100');
      contract.impliedVolatility = undefined; contract.md.seq++;
    });
    await page.getByRole('button', { name: 'VI sin dato · DEMO CALL 100', exact: true }).waitFor({ timeout: 12000 });
    await apply('option', 'Long', 'Call');
    equal(await page.locator('.ct-sim-theory-line').count(), 0, 'Missing IV disables theoretical curve');
    equal(await page.locator('.ct-sim-expiry-line').count(), 1, 'Missing IV preserves expiry curve');
    await page.evaluate(() => {
      const contract = window.mainStore.securityStore.options.find(item => item.id === 'call-100');
      contract.impliedVolatility = 35; contract.md.seq++;
    });
    await page.waitForFunction(() => document.querySelector('[aria-label="VI DEMO CALL 100"]')?.textContent.includes('35,00'), null, { polling: 100, timeout: 12000 });
    checks.push('quotes:missing IV keeps expiry available');
    await page.evaluate(() => { window.mainStore.webSocketConnectionStatus = false; });
    await page.waitForFunction(() => document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]')?.disabled, null, { polling: 100, timeout: 12000 });
    assert(await button('Tomar precio Natural de la estrategia').isDisabled(), 'Disconnected feed disables native entry references');
    await page.evaluate(() => { window.mainStore.webSocketConnectionStatus = true; });
    await page.waitForFunction(() => {
      const el = document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]');
      return el && !el.disabled;
    }, null, { polling: 100, timeout: 12000 });
    checks.push('quotes:disconnected feed blocks selection and recovers');
    await apply('iron-condor', 'Normal');
    assert(!/Enviar|Cancelar orden|Maker|Cruce/.test(await label('Simulador de opciones').innerText()), 'Simulator contains no execution actions');
    checks.push('quotes:crossed-book rejection and recovery; no execution UI');
    return { passed: checks.length, checks, geometry, interactions, preview: page.url(), visibility: await page.evaluate(() => document.visibilityState) };
  } catch (error) {
    throw Error(`After ${checks.length} completed checks: ${error.message}`);
  }
}
