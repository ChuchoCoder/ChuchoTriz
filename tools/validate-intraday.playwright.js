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

  const dollarButton = button('DÓLAR INTRADIARIO · CHUCHOTRIZ');
  await dollarButton.waitFor();
  const [ratiosBounds, dollarBounds] = await Promise.all([button('RATIOS · CHUCHOTRIZ').boundingBox(), dollarButton.boundingBox()]);
  assert(dollarBounds.y >= ratiosBounds.y + ratiosBounds.height && dollarBounds.width === ratiosBounds.width, 'Both choices get a full row in the native flex menu');
  await dollarButton.click();
  const widget = page.locator('.ct-intraday-widget'), dollar = widget.getByLabel('Dólar', { exact: true });
  const legendValue = widget.locator('.ct-intraday-legend strong');
  await widget.getByRole('img', { name: 'Gráfico intradiario de MEP AL30' }).waitFor();
  await valueIs(legendValue, '1.400,00', 'MEP AL30 24 h uses AL30 / AL30D');
  await screenshot('widget', widget);
  await idle(); await dollar.selectOption('CCL');
  await widget.getByRole('img', { name: 'Gráfico intradiario de CCL AL30' }).waitFor();
  await valueIs(legendValue, '1.372,55', 'CCL AL30 24 h uses AL30 / AL30C');
  await page.evaluate(() => window.ratiosFixture.price('AL30-2', 72420));
  await valueIs(legendValue, '1.420,00', 'Live price updates the ratio');
  await idle(); await widget.getByLabel('Plazo', { exact: true }).selectOption('CI');
  await widget.getByText('No se encontró un par BYMA único para esta selección.').waitFor();
  assert(!await widget.locator('.ct-intraday-plot').count(), 'Unavailable CI legs do not substitute 24 h quotes');
  await idle(); await widget.getByLabel('Plazo', { exact: true }).selectOption('24h');
  await idle(); await page.reload();
  await widget.getByRole('img', { name: 'Gráfico intradiario de CCL AL30' }).waitFor();
  assert(await dollar.inputValue() === 'CCL', 'Dollar selection persists across reloads');

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
  await dollar.selectOption('MEP'); await idle();
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
  assert(await widget.getByRole('combobox', { name: 'Bono', exact: true }).isVisible() &&
    await widget.getByRole('combobox', { name: 'Plazo', exact: true }).isVisible() &&
    !(await widget.getByText('Bono', { exact: true }).isVisible()) &&
    !(await widget.getByText('Plazo', { exact: true }).isVisible()) &&
    !(await widget.getByText('Rueda', { exact: true }).isVisible()),
    'Selectors keep their accessible names while their captions are hidden in the widget');
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
