// Wrap in async page => (<source>)(page, { before, after }) for the shared MCP.
async (sharedPage, { before, after }) => {
  const urls = { before: new URL(before), after: new URL(after) };
  for (const url of Object.values(urls)) {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/fixture' || url.searchParams.get('scenario') !== 'regression') throw Error('Use loopback regression fixtures only');
  }

  const page = await sharedPage.context().newPage();
  const cdp = await page.context().newCDPSession(page);
  const result = { cpuRate: 4, before: [], after: [], firstUse: { before: {}, after: {} } };
  const startup = {
    ticket: '#MiniOrderForm button.ButtonPreset:enabled',
    settings: '.ct-free-settings-item',
  };
  const tools = {
    presets: { trigger: '#MiniOrderForm .preset-settings-button', ready: 'input[role="searchbox"]:enabled' },
    simulator: { trigger: '.ct-free-settings-item', ready: '.ct-opt-chain tbody tr td' },
    executions: { label: 'Operaciones de opciones', ready: '.ct-operations-group .ct-operations-copy-button:enabled' },
    ratios: { label: 'Ratios', ready: '.ro-defaults:enabled' },
  };
  const panel = page.getByRole('region', { name: 'Configuración de ChuchoTriz' });
  const openPresets = page.getByRole('button', { name: 'Configurar cantidades rápidas de AL30' });
  const hasMark = async mark => {
    try {
      await page.waitForFunction(name => performance.getEntriesByName(name, 'mark').length > 0, mark);
    } catch (error) {
      const marks = await page.evaluate(() => performance.getEntriesByType('mark').map(({ name }) => name));
      throw Error('Missing ' + mark + ' at ' + page.url() + '; recorded: ' + marks.join(', '), { cause: error });
    }
  };
  const round = value => Math.round(value);
  const getAssets = () => page.evaluate(() => performance.getEntriesByType('resource').flatMap(entry => {
    const path = new URL(entry.name).pathname;
    return path.startsWith('/assets/') || path === '/ticket-position.js' || path.endsWith('-reader.js')
      ? [{ path, bytes: entry.decodedBodySize, startMs: Math.round(entry.startTime), endMs: Math.round(entry.responseEnd) }] : [];
  }));
  const navigate = async variant => {
    await page.goto('about:blank');
    await page.goto(urls[variant].href, { waitUntil: 'commit' });
    await hasMark('ct-ticket');
    await hasMark('ct-settings');
  };

  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'ws://*', 'wss://*'] });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: result.cpuRate });
    page.setDefaultTimeout(8000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.bringToFront();
    await page.addInitScript(({ origins, startup, tools }) => {
      if (!origins.includes(location.origin)) return;
      localStorage.removeItem('ct-demo-regression');
      const mark = name => performance.mark('ct-' + name);
      const marked = name => performance.getEntriesByName('ct-' + name, 'mark').length > 0;
      const pending = new Map(Object.entries(startup));
      const activePanel = '#ct-free-settings-panel:not([hidden]) .ct-tools-content:not([hidden])';
      const observe = () => {
        for (const [name, selector] of pending) {
          if (document.querySelector(selector)) {
            mark(name);
            pending.delete(name);
          }
        }
        if (!pending.size) observer.disconnect();
      };
      const observer = new MutationObserver(observe);
      const startObserving = () => observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
      startObserving();
      document.addEventListener('click', event => {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        const tab = event.target.closest('.ct-tools-tabs button');
        const tool = Object.entries(tools).find(([, target]) => target.trigger
          ? event.target.closest(target.trigger)
          : tab?.textContent.trim() === target.label);
        if (!tool) return;
        const [name, target] = tool;
        if (marked(name + '-click')) return;
        mark(name + '-click');
        pending.set(name + '-ready', activePanel + ' ' + target.ready);
        startObserving();
      }, true);
    }, { origins: Object.values(urls).map(url => url.origin), startup, tools });

    for (const variant of ['before', 'after', 'after', 'before', 'before', 'after', 'after', 'before', 'before', 'after', 'after', 'before']) {
      await navigate(variant);
      const times = await page.evaluate(() => Object.fromEntries(['ticket', 'settings'].map(name =>
        [name, Math.round(performance.getEntriesByName('ct-' + name, 'mark')[0].startTime)])));
      const assets = await getAssets();
      const entryResourcesMs = Math.max(...assets.filter(({ path }) => path.startsWith('/assets/')).map(({ endMs }) => endMs));
      const bytes = extension => assets.filter(({ path }) => path.endsWith(extension)).reduce((sum, asset) => sum + asset.bytes, 0);
      result[variant].push({ ticketMs: times.ticket, settingsMs: times.settings, entryResourcesMs, jsBytes: bytes('.js'), cssBytes: bytes('.css'), assets });
    }

    for (const [name, target] of Object.entries(tools)) {
      for (const variant of ['after', 'before', 'before', 'after', 'after', 'before']) {
        await navigate(variant);
        if (name === 'ratios') {
          await page.evaluate(() => {
            // The Ratios reader requires the fixture's account and an instrument catalog.
            const store = window.mainStore.securityStore;
            store.securities = [...store.underlyingsForMatrix, ...store.options];
          });
        }
        if (target.label) {
          await openPresets.click();
          await hasMark('ct-presets-ready');
        }
        const trigger = target.label ? panel.getByRole('button', { name: target.label, exact: true }) : page.locator(target.trigger);
        await trigger.click();
        await hasMark('ct-' + name + '-ready');
        const [click, ready] = await page.evaluate(tool => ['click', 'ready'].map(suffix =>
          performance.getEntriesByName('ct-' + tool + '-' + suffix, 'mark')[0].startTime), name);
        const assets = (await getAssets()).filter(asset => asset.startMs >= round(click) && asset.endMs <= round(ready));
        (result.firstUse[variant][name] ??= []).push({ readyMs: round(ready - click), assets });
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
    await page.close();
  }
  return result;
}
