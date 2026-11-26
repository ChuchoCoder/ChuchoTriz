// Production bundle and readers, synthetic Matriz stores on loopback only.
async (page, screenshots) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url()) || !await page.evaluate(() => !!window.ratiosFixture)) throw Error('The offline ratios fixture is required.');
  const origin = new URL(page.url()).origin;
  const errors = [], blocked = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === origin) return route.continue();
    blocked.push(requestOrigin); return route.abort();
  });
  await page.routeWebSocket('**/*', socket => { blocked.push(new URL(socket.url()).origin); socket.close(); });
  await page.evaluate(() => {
    for (const key of ['ct-ratios-fixture-main', 'ct-ratios-fixture-alternate', 'ct-ratios-fixture-settings']) localStorage.removeItem(key);
    sessionStorage.removeItem('ct-reference-history-lag');
  });
  await page.reload();
  await page.evaluate(() => {
    window.dollarQuoteReads = 0;
    window.addEventListener('message', event => {
      if (event.origin === location.origin && event.data?.kind === 'request' && event.data?.method === 'ratioIntradayQuotes') window.dollarQuoteReads++;
    });
  });
  const assert = (value, label) => { if (!value) throw Error(label); checks.push(label); };
  const button = name => page.getByRole('button', { name, exact: true });
  const idle = () => page.waitForFunction(() => document.querySelector('.ct-ratios-add')?.disabled === false);
  const screenshot = (name, locator) => screenshots && locator.screenshot({ path: screenshots + '/' + name + '.png' });
  const valueIs = async (locator, value, label) => {
    await locator.filter({ hasText: value }).waitFor();
    assert((await locator.textContent()).trim() === value, label);
  };
  const divisorBeside = async (picker, checkbox, label) => {
    const [input, divisor] = await Promise.all([picker.boundingBox(), checkbox.boundingBox()]);
    assert(input && divisor && divisor.x >= input.x + input.width &&
      Math.abs(input.y + input.height / 2 - (divisor.y + divisor.height / 2)) < 2, label);
  };
  const changeSavedWidget = update => page.evaluate(update => {
    const dashboard = window.mainStore.dashboardStore.currentDashboard;
    const widget = dashboard.layout.find(item => item.component === 'ChuchoTrizIntradayDollarWidget');
    const config = widget.settings.chuchotrizIntradayDollar;
    widget.settings = { ...widget.settings, chuchotrizIntradayDollar: { ...config, ...update, revision: config.revision + 1 } };
    dashboard.onSave();
  }, update);

  const dollarButton = button('DÓLAR INTRADIARIO · CHUCHOTRIZ');
  await dollarButton.waitFor();
  const [ratiosBounds, dollarBounds] = await Promise.all([button('RATIOS · CHUCHOTRIZ').boundingBox(), dollarButton.boundingBox()]);
  assert(dollarBounds.y >= ratiosBounds.y + ratiosBounds.height && dollarBounds.width === ratiosBounds.width, 'Both choices get a full row in the native flex menu');
  await dollarButton.click();
  const widget = page.locator('.ct-intraday-widget');
  const configurePair = widget.getByRole('button', { name: 'Configurar instrumentos A y B', exact: true });
  const editPair = async (a, b) => {
    await idle(); await configurePair.click();
    const editor = widget.getByRole('form', { name: 'Instrumentos del dólar intradiario', exact: true });
    for (const [leg, selection] of [['A', a], ['B', b]]) {
      if (!selection) continue;
      const [ticker, id] = selection;
      const input = editor.getByRole('combobox', { name: 'Instrumento ' + leg, exact: true });
      await input.fill(ticker); await input.press('Tab');
      await input.locator('..').locator('small[title="' + id + '"]').waitFor();
    }
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
    await editor.waitFor({ state: 'hidden' }); await idle();
  };
  const legendValue = widget.locator('.ct-intraday-legend strong');
  await widget.getByRole('img', { name: 'Gráfico intradiario de MEP AL30' }).waitFor();
  await valueIs(legendValue, '1.400,00', 'MEP AL30 24 h uses AL30 / AL30D');
  await page.addStyleTag({ content: 'body { min-height: 2600px; }' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const suspended = await page.evaluate(() => window.dollarQuoteReads);
  await page.waitForTimeout(2400);
  assert(suspended > 0 && suspended === await page.evaluate(() => window.dollarQuoteReads), 'Scrolling out of view pauses Dólar Intradiario quotes');
  await page.evaluate(() => { window.ratiosFixture.price('AL30-2', 71000); window.scrollTo(0, 0); });
  await valueIs(legendValue, '1.420,00', 'Dólar Intradiario refreshes on returning to the viewport');
  await page.evaluate(() => window.ratiosFixture.price('AL30-2', 70000));
  await valueIs(legendValue, '1.400,00', 'The visible dollar widget keeps updating');
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('ct-delay-dollar-legs')) return;
    sessionStorage.removeItem('ct-delay-dollar-legs');
    Object.defineProperty(window, 'mainStore', { configurable: true, set(store) {
      delete window.mainStore;
      window.mainStore = store;
      const catalogue = store.securityStore.securities;
      store.securityStore.securities = [];
      window.restoreDollarLegs = () => { store.securityStore.securities = catalogue; };
    } });
  });
  await page.evaluate(() => sessionStorage.setItem('ct-delay-dollar-legs', '1'));
  await page.reload();
  await widget.getByText('Elegí los instrumentos A y B para mostrar el intradiario.').waitFor();
  await page.evaluate(() => window.restoreDollarLegs());
  await valueIs(legendValue, '1.400,00', 'Saved legacy dollar legs resolve when the catalogue fills without a DOM mutation');
  await screenshot('widget', widget);
  await editPair(undefined, ['AL30C', 'AL30C-2']);
  await widget.getByRole('img', { name: 'Gráfico intradiario de CCL AL30' }).waitFor();
  await valueIs(legendValue, '1.372,55', 'CCL AL30 24 h uses AL30 / AL30C');
  await page.evaluate(() => window.ratiosFixture.price('AL30-2', 72420));
  await valueIs(legendValue, '1.420,00', 'Live price updates the ratio');
  await editPair(['BMA', 'BMA-2'], ['GGAL', 'GGAL-2']);
  await widget.getByRole('img', { name: 'Gráfico intradiario de BMA/GGAL' }).waitFor();
  await valueIs(legendValue, '1,090909', 'Both instruments can be chosen independently from the catalogue');
  await page.reload();
  await widget.getByRole('img', { name: 'Gráfico intradiario de BMA/GGAL' }).waitFor();
  assert((await configurePair.textContent()).trim() === 'BMA / GGAL', 'The custom pair persists across reloads');
  await idle(); await configurePair.click();
  const stalePair = widget.getByRole('form', { name: 'Instrumentos del dólar intradiario', exact: true });
  await changeSavedWidget({ b: { id: 'ALUA-2', symbol: 'ALUA', market: 'bm', currency: 'ARS', settlement: '2' } });
  await configurePair.filter({ hasText: 'BMA / ALUA' }).waitFor();
  assert(await stalePair.getByRole('combobox', { name: 'Instrumento B', exact: true }).inputValue() === 'GGAL',
    'A previously opened edit still has its original draft');
  await stalePair.getByRole('button', { name: 'Guardar', exact: true }).click();
  await widget.getByRole('alert').filter({ hasText: /El widget cambió mientras lo editabas/ }).waitFor();
  assert((await configurePair.textContent()).includes('BMA / ALUA'), 'A stale pair edit leaves a newer dashboard change intact');
  await stalePair.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await idle(); await button('RATIOS · CHUCHOTRIZ').click(); await idle();
  await button('Editar MEP AL30 vs DLR/SPOT').click();
  const editor = page.locator('.ct-ratios-editor');
  const reference = editor.getByRole('combobox', { name: 'Referencia C · ej. Dólar oficial' });
  await reference.fill('D30N6'); await reference.press('Tab');
  await editor.locator('small[title="D30N6-2"]').waitFor();
  const ratioDivisor = editor.getByRole('checkbox', { name: 'Dividir Referencia C por 100' });
  await divisorBeside(reference, ratioDivisor, 'Ratios widget aligns the divisor to the right of C');
  await ratioDivisor.check();
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click(); await idle();
  await page.evaluate(() => window.ratiosFixture.failSeries('D30N6-2', true));
  await button('Comparar MEP AL30 con D30N6').click();
  const dialog = page.getByRole('dialog', { name: 'MEP AL30 vs (D30N6 ÷ 100)' });
  await dialog.getByRole('img', { name: 'Gráfico intradiario de MEP AL30 y D30N6 ÷ 100' }).waitFor();
  await valueIs(dialog.locator('.ct-intraday-line-reference strong'), '1.250,00', 'Comparison applies the saved C divisor');
  assert(await dialog.locator('svg g .ct-intraday-line').count() === 2, 'Comparison draws two distinct series');
  const historyError = dialog.getByText('D30N6 · Histórico no disponible (HTTP 401)');
  await historyError.waitFor();
  await page.evaluate(() => window.ratiosFixture.failSeries('D30N6-2', false));
  await dialog.getByRole('button', { name: 'Reintentar histórico' }).click();
  await historyError.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.ratiosFixture.seriesCounts['D30N6-2'] === 2);
  checks.push('Live quotes remain visible during a series 401 and historical retry recovers');
  await screenshot('comparison', dialog);
  await dialog.getByRole('button', { name: 'Brecha %' }).click();
  await dialog.locator('.ct-intraday-axis-left').first().waitFor();
  assert(/12,00\s*%/.test(await dialog.locator('.ct-intraday-legend strong').textContent()), 'Spread is (1400 / 1250 - 1) × 100');
  assert(!await dialog.locator('.ct-intraday-zero').count(), 'A positive-only spread is not forced to include zero');
  await screenshot('spread', dialog);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Comparar MEP AL30 con D30N6');
  checks.push('Escape closes the dialog and returns focus to the row');

  await page.evaluate(() => window.ratiosFixture.useEarlierReference());
  await editPair(['AL30', 'AL30-2'], ['AL30D', 'AL30D-2']);
  await widget.getByRole('button', { name: 'Configurar Referencia C' }).click();
  const widgetEditor = widget.getByRole('form', { name: 'Referencia del dólar intradiario' });
  const widgetReference = widgetEditor.getByRole('combobox', { name: 'Referencia C', exact: true });
  await widgetReference.fill('D30N6'); await widgetReference.press('Tab');
  await widgetEditor.locator('small[title="D30N6-2"]').waitFor();
  const widgetDivisor = widgetEditor.getByRole('checkbox', { name: 'Dividir C por 100' });
  await divisorBeside(widgetReference, widgetDivisor, 'Dollar widget aligns the divisor to the right of C');
  await widgetDivisor.check();
  await widgetEditor.getByRole('button', { name: 'Guardar', exact: true }).click(); await idle();
  const daySelector = widget.getByRole('combobox', { name: 'Rueda del gráfico' });
  await daySelector.waitFor();
  assert(!(await widget.getByText('Rueda', { exact: true }).isVisible()), 'The date selector keeps its accessible name and hidden caption');
  const spreadValue = widget.locator('.ct-intraday-legend .ct-intraday-line-spread strong');
  await daySelector.locator('option').nth(1).waitFor({ state: 'attached' });
  assert((await daySelector.locator('option:checked').textContent()).includes('hoy'), 'The widget opens on today even when only the previous session has a spread');
  await valueIs(spreadValue, '—', 'The default view does not borrow the previous session spread');
  await daySelector.selectOption({ index: 1 });
  assert(!(await daySelector.locator('option:checked').textContent()).includes('hoy'), 'A previous session remains selectable');
  assert((await widget.locator('.ct-intraday-axis-left').first().textContent()).includes('%'), 'The widget uses a separate percentage axis for the spread');
  assert(!(await widget.locator('.ct-intraday-axis-right').first().textContent()).includes('%'), 'The dollar remains on the right numeric axis');
  assert(/12,00\s*%/.test(await spreadValue.textContent()), 'The in-widget spread uses its own persisted C/100');
  await screenshot('widget-with-reference', widget);
  const spreadOnly = widget.getByRole('button', { name: 'Sólo brecha', exact: true });
  const chosenDay = await daySelector.inputValue();
  const bothTicks = await widget.locator('.ct-intraday-axis-left').allTextContents();
  const plotCoverage = () => widget.locator('svg[role="img"]').evaluate(svg =>
    svg.querySelector('.ct-intraday-grid').getBBox().width / svg.viewBox.baseVal.width);
  assert(await plotCoverage() > 0.75, 'Both axes leave most of the widget width for the data');
  await spreadOnly.click();
  assert(await spreadOnly.getAttribute('aria-pressed') === 'true' &&
    !await widget.locator('.ct-intraday-axis-right, svg .ct-intraday-line-ratio, .ct-intraday-legend .ct-intraday-line-ratio').count(),
  'Sólo brecha hides the dollar line, legend and right axis');
  assert(await daySelector.inputValue() === chosenDay && JSON.stringify(await widget.locator('.ct-intraday-axis-left').allTextContents()) === JSON.stringify(bothTicks),
    'Sólo brecha keeps the selected session and spread scale');
  const controls = await widget.locator('.ct-intraday-controls').boundingBox();
  assert(controls.height <= 32, 'Controls fit on one compact row at the default width');
  assert(await plotCoverage() > 0.85, 'Sólo brecha reclaims the right axis margin');
  await screenshot('widget-spread-only', widget);
  await spreadOnly.click();
  assert(await widget.locator('svg .ct-intraday-line-ratio').count() === 1, 'Toggling again restores the dollar line');
  await daySelector.selectOption({ index: 0 });
  await valueIs(spreadValue, '—', 'The current session does not use an older reference close');
  await page.reload();
  await widget.getByRole('button', { name: 'Configurar Referencia C' }).filter({ hasText: 'C · D30N6 ÷ 100' }).waitFor();
  await daySelector.locator('option').nth(1).waitFor({ state: 'attached' });
  assert((await daySelector.locator('option:checked').textContent()).includes('hoy'), 'Reloading opens today again');
  await daySelector.selectOption({ index: 1 });
  await widget.locator('.ct-intraday-axis-left').first().waitFor();
  checks.push('The widget reference and divisor survive reload');
  await idle();
  const configureC = widget.getByRole('button', { name: 'Configurar Referencia C', exact: true });
  await configureC.click();
  await changeSavedWidget({ cDivisor: undefined });
  await configureC.filter({ hasText: /^C · D30N6$/ }).waitFor();
  await widgetEditor.getByRole('button', { name: 'Quitar C', exact: true }).click();
  await widget.getByRole('alert').filter({ hasText: /El widget cambió mientras lo editabas/ }).waitFor();
  assert((await configureC.textContent()).trim() === 'C · D30N6', 'A stale reference removal leaves a newer dashboard change intact');
  await widgetEditor.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.evaluate(() => {
    const nav = document.querySelector('.DirectAccessBar');
    Object.assign(nav.style, { position: 'fixed', left: '0', top: '0', width: '40px', height: '40px' });
  });
  await page.getByRole('link', { name: 'Configuración (ChuchoTriz)', exact: true }).click();
  await button('Ratios').click();
  const monitor = page.locator('.ro-monitor-controls');
  await monitor.getByRole('checkbox', { name: 'Agregar referencia C', exact: true }).check();
  await divisorBeside(
    monitor.getByRole('combobox', { name: 'Referencia C · ej. DLR/SPOT', exact: true }),
    monitor.getByRole('checkbox', { name: 'Dividir Referencia C por 100', exact: true }),
    'Ratios Monitor aligns the divisor to the right of C',
  );
  await page.locator('.ro-monitor-table').getByRole('button', { name: 'Comparar MEP AL30 con DLR/SPOT', exact: true }).click();
  await page.getByRole('dialog', { name: 'MEP AL30 vs DLR/SPOT' }).getByRole('img').waitFor();
  await page.keyboard.press('Escape');
  checks.push('Monitor opens the chart for its own row reference');
  assert(errors.length === 0, 'No browser exceptions: ' + errors.join(', '));
  assert(blocked.length === 0, 'All requests stayed on the loopback fixture');
  return { passed: checks.length, checks };
};
