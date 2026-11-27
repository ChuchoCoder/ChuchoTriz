// Production bundle against the loopback Ratios fixture only.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url())) throw Error('The offline ratios fixture is required');
  const checks = [];
  const assert = (ok, detail) => { if (!ok) throw Error(detail); checks.push(detail); };
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.evaluate(() => {
    window.intradayQuoteRequests = [];
    window.addEventListener('message', event => {
      if (event.source === window && event.origin === location.origin && event.data?.kind === 'request' &&
          event.data.method === 'ratioIntradayQuotes') window.intradayQuoteRequests.push([...event.data.params.ids].sort());
    });
  });
  const add = page.getByRole('button', { name: 'DÓLAR INTRADIARIO · CHUCHOTRIZ', exact: true });
  const widgets = page.locator('.ct-intraday-widget');
  const legend = widgets.locator('.ct-intraday-legend strong');
  const chartCount = 4;
  for (let index = 0; index < chartCount; index++) {
    await add.click();
    await widgets.nth(index).locator('svg[role="img"]').waitFor();
  }
  const countReads = () => page.evaluate(() => window.intradayQuoteRequests.length);
  const readsDuring = async ms => {
    const start = await countReads();
    await page.waitForTimeout(ms);
    return await countReads() - start;
  };
  const total = await readsDuring(5400);
  assert(total >= 2 && total <= 4, 'Four identical charts share one poll every two seconds (' + total + ' reads)');

  await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
  await page.waitForTimeout(400);
  assert(await readsDuring(4500) === 0, 'Hiding every chart stops the shared quote poll');
  await page.evaluate(() => {
    window.ratiosFixture.price('AL30-2', 71000);
    document.querySelector('.GridLayout').style.display = '';
  });
  await page.waitForFunction(() => {
    const values = [...document.querySelectorAll('.ct-intraday-widget .ct-intraday-legend strong')];
    return values.length === 4 && values.every(value => value.textContent === '1.420,00');
  });
  checks.push('All four charts show the latest market price on returning to view');

  const lastWidget = widgets.last();
  await lastWidget.getByRole('button', { name: 'Configurar instrumentos A y B', exact: true }).click();
  const editor = lastWidget.getByRole('form', { name: 'Instrumentos del dólar intradiario', exact: true });
  const input = editor.getByRole('combobox', { name: 'Instrumento B', exact: true });
  await input.fill('AL30C');
  await input.press('Tab');
  await input.locator('..').locator('small[title="AL30C-2"]').waitFor();
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await lastWidget.getByRole('img', { name: 'Gráfico intradiario de CCL AL30' }).waitFor();
  await page.evaluate(() => window.intradayQuoteRequests.splice(0));
  await page.waitForFunction(() => ['AL30D-2', 'AL30C-2'].every(id =>
    window.intradayQuoteRequests.some(ids => ids.length === 2 && ids.includes('AL30-2') && ids.includes(id))));
  assert((await legend.allTextContents()).filter(value => value === '1.420,00').length === 3,
    'Changing one chart keeps the other quotes intact and starts a separate group');
  return { checks };
}
