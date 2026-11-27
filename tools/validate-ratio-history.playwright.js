// Production widget and reader with the offline native-series fixture.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url())) throw Error('Use the offline Ratios fixture.');
  const checks = [];
  const assert = (condition, detail) => { if (!condition) throw Error(detail); checks.push(detail); };
  const requests = () => page.evaluate(() => window.ratiosFixture.dailySeriesCalls);
  const widget = page.getByRole('region', { name: 'Ratios de instrumentos' });
  const panel = widget.locator('.ct-ratio-history');
  const rowButton = name => widget.getByRole('button', { name, exact: true });
  const graph = name => panel.getByRole('img', { name: 'Gráfico diario de ' + name, exact: true });
  await page.getByRole('button', { name: 'RATIOS · CHUCHOTRIZ', exact: true }).click();
  await rowButton('MEP AL30').waitFor();
  assert(!await panel.count() && !(await requests()).length, 'An unselected widget uses no daily history');
  await rowButton('MEP AL30').press('Enter');
  const mep = graph('MEP AL30');
  await mep.waitFor();
  const tableRect = await widget.locator('.ct-ratios-table-wrap').boundingBox(), panelRect = await panel.boundingBox();
  assert(panelRect.x >= tableRect.x + tableRect.width - 1 && Math.abs(panelRect.y - tableRect.y) < 1, 'The default widget displays history at the right of the table');
  assert(await widget.locator('td.ct-ratios-actions').first().evaluate(cell => getComputedStyle(cell).position) === 'static',
    'Row actions do not overlay the horizontally scrollable table while history is open');
  const range = panel.getByLabel('Rango histórico'), bands = panel.getByLabel('Tipo de bandas');
  assert(await range.inputValue() === '3' && await bands.inputValue() === 'static', 'The initial period is three months with static bands');
  assert(await rowButton('MEP AL30').getAttribute('aria-pressed') === 'true', 'Keyboard selection highlights the row');
  assert(JSON.stringify((await requests()).map(call => call.id)) === JSON.stringify(['AL30-2','AL30D-2']), 'Only the exact selected legs are queried');
  const style = await mep.locator('path[data-sigma]').evaluateAll(lines => lines.map(line => {
    const css = getComputedStyle(line);
    return { sigma: Number(line.dataset.sigma), stroke: css.stroke, dash: css.strokeDasharray, fill: css.fill };
  }));
  const light = await page.evaluate(() => document.documentElement.dataset.theme === 'dma_day');
  assert(style.length === 4 && style.every(({ sigma, stroke, dash, fill }) =>
    fill === 'none' && (Math.abs(sigma) === 1
      ? stroke === (light ? 'rgb(36, 99, 70)' : 'rgb(131, 217, 168)') && dash === '6px, 4px'
      : stroke === (light ? 'rgb(120, 91, 7)' : 'rgb(240, 206, 112)') && dash === '2px, 4px')),
  'All four bands use the themed Options colors and line styles without area fills');
  const firstBand = mep.locator('path[data-sigma="1"]'), fixedPath = await firstBand.getAttribute('d');
  await bands.selectOption('moving');
  assert(await firstBand.getAttribute('d') !== fixedPath && (await panel.innerText()).includes('20 cierres coincidentes previos'), 'Changing the mode redraws bands using the previous 20 closes');
  assert((await requests()).length === 2 && await range.inputValue() === '3', 'Band mode does not fetch again or change the period');
  const point = panel.locator('.ct-ratio-history-point time'), latestDay = await point.getAttribute('datetime');
  await mep.press('ArrowLeft');
  assert(await point.getAttribute('datetime') < latestDay, 'Keyboard cursor inspects prior closes');
  await widget.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'CCL AL30', exact: true }) }).locator('.ct-ratios-value').click();
  await graph('CCL AL30').waitFor();
  assert(await range.inputValue() === '3' && await bands.inputValue() === 'moving', 'Changing the row keeps the chosen period and band mode');
  assert(JSON.stringify((await requests()).map(call => call.id)) === JSON.stringify(['AL30-2','AL30D-2','AL30C-2']), 'The shared AL30 request is reused across rows');
  await range.selectOption('6');
  await graph('CCL AL30').waitFor();
  const longer = await requests();
  assert(longer.length === 5 && longer[3].from < longer[0].from, 'Changing the preset queries the larger period');
  await range.selectOption('custom');
  const until = panel.getByLabel('Hasta'), since = panel.getByLabel('Desde');
  const end = await until.getAttribute('max');
  const start = new Date(Date.parse(end) - 24 * 86400000).toISOString().slice(0, 10);
  await since.fill(start); await until.fill(end);
  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await graph('CCL AL30').waitFor();
  assert(await range.inputValue() === 'custom' && (await requests()).length === 7, 'Custom dates apply only when confirmed');
  await page.evaluate(() => window.ratiosFixture.failDailySeries('rx_DDF_DLR_SPOT', true));
  await rowButton('MEP AL30 vs DLR/SPOT').click();
  await panel.getByText('Sin cierres coincidentes en el rango.', { exact: true }).waitFor();
  assert((await requests()).at(-1).id === 'rx_DDF_DLR_SPOT' && await panel.getByText(/HTTP 401/).isVisible(),
    'Reference C is requested by exact ID and a failed leg reports that history is unavailable');
  await page.evaluate(() => window.ratiosFixture.failDailySeries('rx_DDF_DLR_SPOT', false));
  await panel.getByRole('button', { name: 'Reintentar histórico' }).click();
  await graph('MEP AL30 vs DLR/SPOT').waitFor();
  assert((await panel.locator('.ct-ratio-history-point').innerText()).includes('%'), 'Retry recovers C and applies the selected row’s percent format');
  const beforeIdle = (await requests()).length;
  await page.evaluate(() => window.ratiosFixture.price('AL30-2', 71000));
  await page.waitForFunction(() => document.querySelector('.ct-ratios-quote')?.textContent.includes('71.000'), null, { timeout: 5000 });
  assert((await requests()).length === beforeIdle, 'A live quote update does not refetch daily history');
  await page.evaluate(() => window.ratiosFixture.makeDailySeriesSparse('ALUA-2'));
  await bands.selectOption('static');
  await rowButton('ALUA/TXAR').click();
  await graph('ALUA/TXAR').waitFor();
  const beforeOlder = (await requests()).length;
  await bands.selectOption('moving');
  await panel.getByText('Bandas de los 20 cierres coincidentes previos.', { exact: true }).waitFor();
  const older = (await requests()).slice(beforeOlder);
  assert(older.length === 2 && older.every(call => call.to < Date.parse(start) / 1000 - 90 * 86400),
    'Sparse moving bands look farther back and use 20 prior coincident closes');
  const resize = widget.getByRole('button', { name: 'Redimensionar Ratios' });
  for (let step = 0; step < 3; step++) {
    await resize.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.ct-ratios-resize')?.getAttribute('aria-disabled') === 'false');
  }
  const narrowTable = await widget.locator('.ct-ratios-table-wrap').boundingBox(), narrowPanel = await panel.boundingBox();
  assert(narrowPanel.y >= narrowTable.y + narrowTable.height - 1, 'Narrow widgets put the chart below the table without resizing automatically');
  await panel.getByRole('button', { name: 'Cerrar histórico de Ratios' }).click();
  assert(!await panel.count() && await rowButton('ALUA/TXAR').evaluate(node => document.activeElement === node),
    'Closing history restores table width and focus to the selected row');
  return { count: checks.length, checks };
};
