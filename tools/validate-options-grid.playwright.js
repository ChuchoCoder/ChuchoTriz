// Run with the shared Playwright MCP on the local preview-free.mjs /fixture tab.
async (page) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture$/.test(page.url())) throw Error('Select the local fixture tab first.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  const reader = '**/options-market-reader.js';
  const holdCatalog = async route => { await catalogGate; await route.continue(); };
  await page.route(reader, holdCatalog);
  const chain = page.locator('.ct-opt-chain-scroll');
  const geometry = () => chain.evaluate(grid => {
    const panel = grid.closest('.ct-sim');
    return {
      panelHeight: panel.clientHeight, panelOverflow: panel.scrollHeight - panel.clientHeight,
      width: grid.clientWidth, height: grid.clientHeight, overflow: grid.scrollHeight - grid.clientHeight,
      fits: grid.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom,
    };
  });
  try {
    await page.evaluate(() => {
      const { securityStore } = window.mainStore;
      const pair = securityStore.options.slice(0, 2);
      securityStore.options = Array.from({ length: 50 }, (_, index) => pair.map(option => ({
        ...option, id: option.id + '-' + index, symbolStr: option.symbolStr + '-' + index,
        refData: { ...option.refData, strikePrice: 50 + index * 2 },
      }))).flat();
      const securities = new Map([...securityStore.underlyingsForMatrix, ...securityStore.options].map(item => [item.id, item]));
      const quotes = new Promise(resolve => { window.releaseGridQuotes = resolve; });
      securityStore.getSecurity = async id => { await quotes; return securities.get(id); };
    });
    await page.locator('.ct-free-settings-item').evaluate(link => link.click());
    const initial = await geometry();
    releaseCatalog();
    const rows = chain.locator('tr[data-option-strike]');
    await rows.nth(49).waitFor({ state: 'attached' });
    const pending = await geometry();
    const availableQuotes = chain.locator('.ct-opt-price button:enabled');
    if (await availableQuotes.count()) throw Error('Quotes became selectable before the snapshot arrived.');
    await page.evaluate(() => window.releaseGridQuotes());
    await availableQuotes.first().waitFor({ state: 'attached' });
    const loaded = await geometry();
    for (const sample of [pending, loaded]) {
      if (!sample.fits || sample.panelHeight !== initial.panelHeight || sample.panelOverflow !== initial.panelOverflow ||
          sample.width !== initial.width || sample.height !== initial.height || sample.overflow <= 0) {
        throw Error('The chain changed its visible area while loading: ' + JSON.stringify({ initial, pending, loaded }));
      }
    }
    await chain.evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
    if (!(await chain.evaluate(grid => grid.scrollTop > 0))) throw Error('The chain must still scroll.');
    return { rows: await rows.count(), initial, pending, loaded };
  } finally {
    releaseCatalog();
    await page.evaluate(() => window.releaseGridQuotes?.());
    await page.unroute(reader, holdCatalog);
  }
}
