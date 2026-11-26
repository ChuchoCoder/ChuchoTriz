// Wrap in async page => (<source>)(page, { before, after }) for the shared MCP.
async (sharedPage, { before, after }) => {
  const urls = { before: new URL(before), after: new URL(after) };
  for (const url of Object.values(urls)) {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/fixture' || url.searchParams.get('scenario') !== 'regression') throw Error('Use loopback regression fixtures only');
  }
  const result = { cpuRate: 4, before: [], after: [], firstUse: {} };
  const order = ['before', 'after', 'after', 'before', 'before', 'after'];
  for (const variant of order) {
    const origin = urls[variant].origin;
    const page = await sharedPage.context().newPage();
    const cdp = await page.context().newCDPSession(page);
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
    const assets = () => page.evaluate(() => performance.getEntriesByType('resource').flatMap(entry => {
      const path = new URL(entry.name).pathname;
      return path.startsWith('/assets/') || path === '/ticket-position.js' || path.endsWith('-reader.js') ? [{ path, bytes: entry.decodedBodySize }] : [];
    }));
    try {
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('#MiniOrderForm .ButtonPreset') && document.querySelector('.ct-free-settings-item')) {
            performance.mark('ct-ticket-ready');
            observer.disconnect();
          }
        });
        observer.observe(document, { subtree: true, childList: true });
      });
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: result.cpuRate });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.bringToFront();
      const start = await metrics();
      await page.goto(urls[variant].href, { waitUntil: 'load' });
      await page.waitForFunction(() => performance.getEntriesByName('ct-ticket-ready', 'mark').length > 0);
      const end = await metrics();
      const initialAssets = await assets();
      const bytes = extension => initialAssets.filter(({ path }) => path.endsWith(extension)).reduce((sum, asset) => sum + asset.bytes, 0);
      result[variant].push({
        readyMs: Math.round(await page.evaluate(() => performance.getEntriesByName('ct-ticket-ready', 'mark')[0].startTime)),
        scriptMs: +(1000 * (end.ScriptDuration - start.ScriptDuration)).toFixed(2),
        jsBytes: bytes('.js'), cssBytes: bytes('.css'), assets: initialAssets,
      });
      if (!result.firstUse[variant]) {
        const panel = page.getByRole('region', { name: 'Configuración de ChuchoTriz' });
        const stages = [];
        const stage = async (name, action, ready) => {
          const start = await page.evaluate(() => performance.now());
          await action.click();
          await ready.waitFor();
          stages.push({ name, readyMs: Math.round(await page.evaluate(since => performance.now() - since, start)), assets: await assets() });
        };
        await stage('presets', page.getByRole('button', { name: 'Configurar cantidades rápidas de AL30' }), panel.getByRole('searchbox', { name: 'Buscar instrumento por ticker' }));
        await stage('simulator', panel.getByRole('button', { name: 'Simulador de opciones' }), panel.locator('.ct-sim'));
        await stage('executions', panel.getByRole('button', { name: 'Operaciones de opciones' }), panel.getByRole('button', { name: 'Copiar Calls y Puts' }));
        await stage('ratios', panel.getByRole('button', { name: 'Ratios', exact: true }), panel.locator('.ro-monitor-table'));
        result.firstUse[variant] = stages;
      }
    } finally {
      await cdp.detach().catch(() => {});
      await page.close();
    }
  }
  return result;
}
