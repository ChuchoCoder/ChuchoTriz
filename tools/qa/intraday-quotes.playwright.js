// Production bundle against the loopback Ratios fixture only.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url())) throw Error('The offline ratios fixture is required');
  const checks = [];
  const assert = (ok, detail) => { if (!ok) throw Error(detail); checks.push(detail); };
  await page.setViewportSize({ width: 1440, height: 1600 });
  const recordQuotes = () => {
    window.intradayQuoteRequests = [];
    window.addEventListener('message', event => {
      if (event.source === window && event.origin === location.origin && event.data?.kind === 'request' &&
          event.data.method === 'ratioIntradayQuotes') {
        window.intradayQuoteRequests.push({ ids: [...event.data.params.ids].sort(), at: performance.now() });
      }
    });
  };
  await page.evaluate(recordQuotes);
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

  const beforeToggling = await countReads();
  await page.waitForFunction(count => window.intradayQuoteRequests.length > count, beforeToggling);
  const lastWidget = widgets.last();
  const setLastVisible = visible => lastWidget.evaluate((widget, shown) => {
    widget.closest('[data-ct-ratios-slot]').style.display = shown ? '' : 'none';
  }, visible);
  for (let n = 0; n < 3; n++) {
    await setLastVisible(false);
    await page.waitForTimeout(160);
    await setLastVisible(true);
    await page.waitForTimeout(160);
  }
  await page.waitForFunction(count => window.intradayQuoteRequests.length >= count + 2, beforeToggling);
  const gaps = await page.evaluate(count => window.intradayQuoteRequests.slice(count + 1).map(({ at }, index) =>
    at - window.intradayQuoteRequests[count + index].at), beforeToggling);
  assert(gaps.every(gap => gap >= 1800), 'Revealing one chart does not restart a group that is already polling');

  await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
  await page.waitForTimeout(400);
  assert(await readsDuring(4500) === 0, 'Hiding every chart stops the shared quote poll');
  await page.evaluate(() => {
    const send = window.postMessage;
    let heldId, release;
    window.quoteReply = { held: false, retired: false, delivered: false, restore() { window.postMessage = send; release?.(); } };
    window.addEventListener('message', event => {
      if (heldId && event.source === window && event.data?.id === heldId && event.data.kind === 'response') {
        window.quoteReply.delivered = true;
      }
    });
    window.postMessage = function (message, ...args) {
      if (!heldId && message?.kind === 'request' && message.method === 'ratioIntradayQuotes') heldId = message.id;
      if (heldId && message?.id === heldId && message.kind === 'response') {
        release = () => send.call(window, message, ...args);
        window.quoteReply.held = true;
        return;
      }
      if (heldId && message?.id === heldId && message.kind === 'retire') window.quoteReply.retired = true;
      return send.call(window, message, ...args);
    };
    document.querySelector('.GridLayout').style.display = '';
  });
  try {
    await page.waitForFunction(() => window.quoteReply.held);
    await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
    await page.waitForFunction(() => window.quoteReply.retired);
    await page.evaluate(() => {
      window.ratiosFixture.price('AL30-2', 71000);
      document.querySelector('.GridLayout').style.display = '';
    });
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('.ct-intraday-widget .ct-intraday-legend strong')];
      return values.length === 4 && values.every(value => value.textContent === '1.420,00');
    });
    checks.push('Revealed charts refresh without waiting for a retired quote response');
  } finally {
    await page.evaluate(() => window.quoteReply.restore());
  }
  await page.waitForFunction(() => window.quoteReply.delivered);
  const shown = await legend.allTextContents();
  assert(shown.length === 4 && shown.every(value => value === '1.420,00'), 'All four charts keep the fresh price when the retired response returns');

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
    window.intradayQuoteRequests.some(({ ids }) => ids.length === 2 && ids.includes('AL30-2') && ids.includes(id))));
  assert((await legend.allTextContents()).filter(value => value === '1.420,00').length === 3,
    'Changing one chart keeps the other quotes intact and starts a separate group');

  await page.addInitScript(recordQuotes);
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    let readerLoads = 0;
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
      ...descriptor,
      set(value) {
        // Give the chart reader a separate URL so it cannot reuse the dashboard script response.
        const delay = value.endsWith('/ratios-reader.js') && ++readerLoads === 2;
        descriptor.set.call(this, delay ? value + '?chart=delayed' : value);
      },
    });
  });
  let release;
  const beforeChartReader = new Promise(resolve => { release = resolve; });
  const readerUrl = /\/ratios-reader\.js\?chart=delayed$/;
  const delayChartReader = async route => {
    await beforeChartReader;
    await route.continue();
  };
  await page.route(readerUrl, delayChartReader);
  try {
    const chartRequested = page.waitForRequest(readerUrl);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await chartRequested;
    await page.evaluate(() => { document.querySelector('.GridLayout').style.display = 'none'; });
    await page.waitForTimeout(400);
    const chartLoaded = page.waitForResponse(readerUrl);
    release();
    await chartLoaded;
    await page.waitForTimeout(2500);
    assert(await countReads() === 0, 'A reader that finishes loading after all charts hide sends no quotes');
  } finally {
    release();
    await page.unroute(readerUrl, delayChartReader);
  }
  await page.evaluate(() => {
    const send = window.postMessage;
    const groups = new Set();
    window.restoreQuoteDispatch = () => { window.postMessage = send; };
    // Only let the first quote through for each group. Every initially visible
    // chart should have joined before that quote was dispatched.
    window.postMessage = function (message, ...args) {
      if (message?.kind === 'request' && message.method === 'ratioIntradayQuotes') {
        const key = JSON.stringify(message.params.ids);
        if (groups.has(key)) return;
        groups.add(key);
      }
      return send.call(window, message, ...args);
    };
    document.querySelector('.GridLayout').style.display = '';
  });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ct-intraday-widget svg[role="img"]').length === 4);
    checks.push('The delayed reader updates all charts in each group from their first dispatched quote');
  } finally {
    await page.evaluate(() => window.restoreQuoteDispatch());
  }
  return { checks };
}
