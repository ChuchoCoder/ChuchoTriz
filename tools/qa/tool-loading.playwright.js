// Exercise the packaged content script against the local fixture.
async page => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Select the local regression fixture.');
  const checks = [], seen = [];
  const assert = (ok, detail) => { if (!ok) throw Error(detail); checks.push(detail); };
  const chunk = name => new RegExp('/assets/' + name + '-[\\w-]+\\.js$');
  const simulator = chunk('OptionsSimulator'), operations = chunk('OptionsOperations'), ratios = chunk('RatioOperations');
  const count = pattern => seen.filter(url => pattern.test(url)).length;
  const onRequest = request => { seen.push(new URL(request.url()).pathname); };
  page.on('request', onRequest);

  const ticket = page.locator('#MiniOrderForm');
  const panel = page.getByRole('region', { name: 'Configuración de ChuchoTriz' });
  const tab = name => panel.getByRole('button', { name, exact: true });
  const openPresets = async () => {
    await ticket.getByRole('button', { name: 'Configurar cantidades rápidas de AL30' }).click();
    await panel.getByRole('searchbox', { name: 'Buscar instrumento por ticker' }).waitFor();
  };
  const hasTools = () => [simulator, operations, ratios].some(pattern => count(pattern) > 0);

  try {
    await page.reload({ waitUntil: 'load' });
    await ticket.locator('.ButtonPreset').first().waitFor();
    assert(!hasTools(), 'The ticket becomes ready without requesting a tool module');
    await openPresets();
    assert(!hasTools(), 'The ticket shortcut opens presets without loading the default simulator or either operations tool');

    const initialSheets = await page.evaluate(() => document.adoptedStyleSheets.length);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const hold = async route => { await gate; await route.continue(); };
    await page.route(simulator, hold);
    try {
      const started = page.waitForRequest(request => simulator.test(request.url()));
      await tab('Simulador de opciones').click();
      await started;
      await panel.getByRole('status').filter({ hasText: 'Cargando herramienta' }).waitFor();
      assert(count(simulator) === 1 && !count(operations) && !count(ratios), 'Only the selected simulator is requested and its loading state is visible');
      assert(await tab('Cantidades rápidas').isEnabled(), 'Other tabs remain available during loading');
    } finally {
      release();
      await page.unroute(simulator, hold);
    }

    await panel.locator('.ct-sim').waitFor();
    assert(await page.evaluate(start => document.adoptedStyleSheets.length === start + 1, initialSheets), 'The simulator styles arrive with its module');
    await page.evaluate(() => { window.originalSimulatorPane = document.querySelector('.ct-sim'); });
    await tab('Operaciones de opciones').click();
    await panel.getByRole('button', { name: 'Copiar Calls y Puts' }).waitFor();
    assert(count(operations) === 1 && !count(ratios), 'Options executions load on their own first visit');
    await tab('Ratios').click();
    await panel.locator('.ro-monitor-table').waitFor();
    assert(count(ratios) === 1, 'Ratio operations load on their own first visit');
    await tab('Simulador de opciones').click();
    await panel.locator('.ct-sim').waitFor();
    assert(count(simulator) === 1 && await page.evaluate(() => window.originalSimulatorPane === document.querySelector('.ct-sim')), 'Returning to the simulator reuses the module and preserves the mounted editor');

    await page.reload({ waitUntil: 'load' });
    const reject = route => route.abort();
    await page.route(operations, reject);
    try {
      await openPresets();
      await tab('Operaciones de opciones').click();
      await panel.getByRole('alert').filter({ hasText: 'No se pudo cargar esta herramienta' }).waitFor();
      await tab('Cantidades rápidas').click();
      await panel.getByRole('searchbox', { name: 'Buscar instrumento por ticker' }).waitFor();
      await panel.getByRole('button', { name: 'Volver a Matriz' }).click();
      await ticket.locator('.ButtonPreset').first().click();
      assert(Number(await page.locator('#cantidad').inputValue()) > 0, 'A failed download leaves the preset editor and ticket usable');
    } finally { await page.unroute(operations, reject); }
  } finally { page.off('request', onRequest); }
  return { checks };
}
