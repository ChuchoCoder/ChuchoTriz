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
    await panel.locator('input[role="searchbox"]:enabled').waitFor();
  };
  const hasTools = () => [simulator, operations, ratios].some(pattern => count(pattern) > 0);

  const statusContrast = status => status.evaluate(element => {
    const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
      .map(channel => channel / 255)
      .reduce((total, channel, index) => total + [.2126, .7152, .0722][index] *
        (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4), 0);
    const text = luminance(getComputedStyle(element).color);
    let backgroundColor = 'rgb(255, 255, 255)';
    for (let parent = element; parent; parent = parent.parentElement) {
      const color = getComputedStyle(parent).backgroundColor;
      if (!color.startsWith('rgb(')) continue;
      backgroundColor = color;
      break;
    }
    const background = luminance(backgroundColor);
    return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
  });

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
      const status = panel.getByRole('status').filter({ hasText: 'Cargando herramienta' });
      await status.waitFor();
      assert(count(simulator) === 1 && !count(operations) && !count(ratios), 'Only the selected simulator is requested and its loading state is visible');
      assert(await statusContrast(status) >= 4.5, 'Loading text meets the 4.5:1 contrast minimum');
      await page.keyboard.press('Tab');
      assert(await tab('Operaciones de opciones').evaluate(button => button.matches(':focus-visible')), 'Keyboard focus moves to the next tool while loading');
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
      const alert = panel.getByRole('alert').filter({ hasText: 'No se pudo cargar esta herramienta' });
      await alert.waitFor();
      assert(await statusContrast(alert) >= 4.5, 'Error text meets the 4.5:1 contrast minimum');
      await page.keyboard.press('Tab');
      assert(await tab('Cantidades rápidas').evaluate(button => button.matches(':focus-visible')), 'Keyboard focus can leave the failed tool');
      await page.keyboard.press('Enter');
      await panel.locator('input[role="searchbox"]:enabled').waitFor();
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      assert(await ticket.getByRole('button', { name: 'Configurar cantidades rápidas de AL30' }).evaluate(button => button.matches(':focus')), 'Escape returns focus to the ticket shortcut');
      await ticket.locator('.ButtonPreset').first().click();
      assert(Number(await page.locator('#cantidad').inputValue()) > 0, 'A failed download leaves the preset editor and ticket usable');
    } finally { await page.unroute(operations, reject); }
  } finally { page.off('request', onRequest); }
  return { checks };
}
