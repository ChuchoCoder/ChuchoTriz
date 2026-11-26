// Computed colors from the production bundle on an owned loopback fixture.
async (page, group) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture(?:\?scenario=regression)?$/.test(page.url())) throw Error('Local theme fixture required');
  const theme = await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const cases = [];
  const contrast = async (id, name, locator, { foreground = 'color', minimum = 4.5, state = 'visible' } = {}) => {
    await locator.waitFor({ state });
    const result = await locator.evaluate(async (element, property) => {
      const style = getComputedStyle(element);
      // Force style resolution before waiting for the CSS transition.
      void style.getPropertyValue(property);
      await Promise.allSettled(element.getAnimations().map(animation => animation.finished));
      const rgb = value => {
        const parts = value.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map(Number);
        if (!parts || parts.length < 3 || parts.some(x => !Number.isFinite(x))) throw Error('Unsupported computed color ' + value);
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const overlay = (front, back) => front.slice(0, 3).map((value, channel) => value * front[3] + back[channel] * (1 - front[3]));
      const layers = [];
      for (let node = element; node; node = node.parentElement) layers.unshift(rgb(getComputedStyle(node).backgroundColor));
      const background = layers.reduce((back, front) => overlay(front, back), [255, 255, 255]);
      const text = overlay(rgb(style.getPropertyValue(property)), background);
      const luminance = channels => channels.reduce((total, channel, i) => {
        const x = channel / 255;
        return total + [.2126, .7152, .0722][i] * (x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
      }, 0);
      const a = luminance(text), b = luminance(background);
      return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), text, background,
        alpha: rgb(style.backgroundColor)[3], border: style.borderTopColor };
    }, foreground);
    const detail = `${name}: ${result.ratio.toFixed(2)}:1 (mínimo ${minimum}:1)`;
    if (result.ratio < minimum) throw Error(`${detail}. RGB ${result.text} sobre ${result.background}.`);
    cases.push({ id, status: 'PASS', detail });
    return result;
  };

  if (group === 'theme-controls') {
    const preset = page.locator('#MiniOrderForm .ButtonPreset').first();
    const rest = await contrast('TH-01', 'Preset del ticket', preset);
    await preset.hover();
    const hovered = await contrast('TH-15', 'Preset al pasar el mouse', preset, { minimum: rest.ratio });
    if (rest.alpha !== 0 || hovered.alpha <= 0 || hovered.alpha >= 1 || hovered.border === rest.border) {
      throw Error('Preset hover must add a translucent tint and change the border');
    }
    await page.mouse.move(2, 2);
    await contrast('TH-02', 'Autocompletar del ticket', page.locator('#MiniOrderForm .instrument-autocomplete label'));
    await page.getByRole('link', { name: 'Configuración (ChuchoTriz)' }).click();
    const panel = page.locator(`#ct-free-settings-panel[data-color-scheme="${theme}"]`);
    await panel.waitFor({ state: 'visible' });
    await contrast('TH-03', 'Encabezado de Configuración', panel.locator('h1'));
    await contrast('TH-04', 'Pestaña seleccionada del simulador', panel.locator('.ct-tools-tabs button[aria-pressed=true]'));
    await contrast('TH-05', 'Un encabezado de la cadena de opciones', panel.locator('.ct-sim th').first());
    await panel.getByRole('button', { name: 'Cantidades rápidas' }).click();
    await contrast('TH-06', 'Instrumento del editor de presets', panel.locator('#selected-instrument'));
    await panel.getByRole('button', { name: 'Operaciones de opciones' }).click();
    await contrast('TH-07', 'Encabezado de una ejecución', panel.locator('.ct-operations-group h3').first());
    await panel.getByRole('button', { name: 'Ratios', exact: true }).click();
    await contrast('TH-08', 'Texto auxiliar del registro de Ratios', panel.locator('.ro-heading small'));

    await page.addInitScript(() => {
      window.chrome = { storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener() {}, removeListener() {} },
      } };
    });
    await page.goto(new URL('/index.html', page.url()).href, { waitUntil: 'domcontentloaded' });
    await contrast('TH-09', 'Título de Opciones independiente', page.locator('.options-heading h1'));
  } else if (group === 'theme-widgets') {
    await page.getByRole('button', { name: 'RATIOS · CHUCHOTRIZ', exact: true }).click();
    await contrast('TH-10', 'Cabecera del widget Ratios', page.locator('.ct-ratios th').first());
    await contrast('TH-11', 'Valor de un ratio del dashboard', page.locator('.ct-ratios .ct-ratios-value').first());
    await page.getByRole('button', { name: 'Gráfico intradiario de AL30' }).focus();
    const book = page.locator('.ct-book-intraday');
    await contrast('TH-12', 'Título del Book intradiario', book.locator('strong'));
    await contrast('TH-13', 'Etiqueta del eje del Book intradiario', book.locator('svg text').first(), { foreground: 'fill' });
    // The SVG is visible even when a single trade gives the polyline a zero-height box.
    await contrast('TH-14', 'Línea de precio del Book intradiario', book.locator('.ct-book-intraday-line'),
      { foreground: 'stroke', minimum: 3, state: 'attached' });
    await page.keyboard.press('Escape');
    await book.waitFor({ state: 'hidden' });
  } else {
    throw Error(`Unknown theme group: ${group}`);
  }
  return { cases };
}
