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
  } else if (group === 'ticket-position') {
    const panel = page.getByRole('region', { name: 'Tenencia del instrumento', exact: true });
    const close = page.getByRole('button', { name: 'Ocultar tenencia', exact: true });
    const eye = page.getByRole('button', { name: 'Mostrar tenencia', exact: true });
    const qty = page.locator('#cantidad');
    const select = (term = 'CI') => page.evaluate(value => window.ctUseTicketPositionFixture(value), term);
    const expectRows = async (ci, next) => {
      await panel.locator('table').waitFor();
      const result = await panel.locator('tbody').evaluate(element => [...element.rows].map(row => [...row.cells].map(cell => cell.textContent)));
      if (JSON.stringify(result) !== JSON.stringify([ci, next])) throw Error(`Saldos incorrectos: ${JSON.stringify(result)}`);
    };
    await select();
    await qty.fill('2500');
    await expectRows(['CI', '12.500', '15.000', '10.000'], ['24 h', '10.000', '12.500', '7.500']);
    const buy = await contrast('TP-01', 'Columna Si comprás', panel.locator('thead .ct-buy'));
    const sell = await contrast('TP-02', 'Columna Si vendés', panel.locator('thead .ct-sell'));
    if (buy.ratio === sell.ratio) throw Error('Compra y venta deben usar colores distintos');
    await contrast('TP-03', 'Tenencia actual', panel.locator('.ct-current').first());
    await contrast('TP-04', 'Cruz de cierre', close.locator('svg'), { foreground: 'stroke', minimum: 3 });
    await select('24hs');
    await panel.getByText('Orden a 24 h', { exact: true }).waitFor();
    await expectRows(['CI', '12.500', '12.500', '12.500'], ['24 h', '10.000', '12.500', '7.500']);
    const [stripBox, closeBox] = await Promise.all([panel.boundingBox(), close.boundingBox()]);
    if (!stripBox || !closeBox || closeBox.y - stripBox.y > 4 || stripBox.x + stripBox.width - closeBox.x - closeBox.width > 4) {
      throw Error('Cruz fuera de la esquina del panel');
    }
    await close.press('Space');
    await eye.waitFor();
    await panel.waitFor({ state: 'hidden' });
    if (!await eye.evaluate(button => document.activeElement === button && button.matches(':focus-visible'))) throw Error('Foco perdido al ocultar');
    if (await qty.inputValue() !== '2500') throw Error('Ocultar alteró la cantidad');
    const [eyeBox, qtyBox] = await Promise.all([eye.boundingBox(), qty.boundingBox()]);
    if (!eyeBox || !qtyBox || eyeBox.x < qtyBox.x + qtyBox.width - 1 || Math.abs(eyeBox.y - qtyBox.y) > 8) {
      throw Error('Ojo desalineado respecto de Cantidad');
    }
    await contrast('TP-05', 'Ojo junto a Cantidad', eye.locator('svg'), { foreground: 'stroke', minimum: 3 });
    await eye.evaluate(button => button.click());
    if ((await page.evaluate(() => chrome.storage.local.get('TicketPositionVisible'))).TicketPositionVisible !== false) {
      throw Error('Un clic sintético cambió la preferencia persistida');
    }
    await page.reload();
    await select('24hs');
    await eye.waitFor();
    await panel.waitFor({ state: 'hidden' });
    if (await select('24hs') !== 0) throw Error('Se consultó la tenencia con la franja oculta');
    await qty.fill('2500');
    await eye.press('Enter');
    await close.waitFor();
    await expectRows(['CI', '12.500', '12.500', '12.500'], ['24 h', '10.000', '12.500', '7.500']);
    if (!await close.evaluate(button => document.activeElement === button && button.matches(':focus-visible'))) throw Error('Foco perdido al mostrar');
    await panel.getByRole('button', { name: /^Usar 10\.000/ }).click();
    await page.waitForFunction(() => document.getElementById('cantidad').value === '10000');
    await expectRows(['CI', '12.500', '12.500', '12.500'], ['24 h', '10.000', '20.000', '0']);
    await page.reload();
    await select();
    await panel.locator('table').waitFor();
    cases.push({ id: 'TP-06', status: 'PASS', detail: 'CI y 24 h, cruz y ojo con teclado, borrador conservado, preferencia oculta/visible tras recarga, pausa y recarga de posición' });

    await page.evaluate(() => {
      const portfolio = Object.getPrototypeOf(window.mainStore.portfolioStore);
      const read = portfolio.getDetailedPositionReport;
      portfolio.getDetailedPositionReport = () => new Promise((_, reject) => {
        window.ctRejectTicketPositionRead = () => {
          portfolio.getDetailedPositionReport = read;
          reject(Error('Falla de posición simulada'));
        };
      });
    });
    await select('24hs');
    const status = panel.getByRole('status');
    await panel.getByText('Consultando posición 24 h…', { exact: true }).waitFor();
    await contrast('TP-07', 'Consulta de posición', status);
    await page.waitForFunction(() => typeof window.ctRejectTicketPositionRead === 'function');
    await page.evaluate(() => window.ctRejectTicketPositionRead());
    await panel.getByText('Posición no disponible', { exact: true }).waitFor();
    await contrast('TP-08', 'Posición no disponible', status);
    await panel.locator('table').waitFor({ state: 'hidden' });

    await page.evaluate(() => {
      const group = window.mainStore.portfolioStore.detailedPositionReport.types.find(item => item.type === 'BOND');
      group.securitiesDetailed[0].detailedPositions[0].totalCollateralSize = 1;
    });
    await select();
    await panel.getByText('Incluye garantía', { exact: true }).waitFor();
    await contrast('TP-09', 'Tenencia con garantía', status);
    await panel.locator('.ct-ticket-position-fill').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      const instrument = window.mainStore.portfolioStore.detailedPositionReport.types.find(item => item.type === 'BOND').securitiesDetailed[0];
      delete instrument.instrumentCollateralSize;
      delete instrument.detailedPositions[0].totalCollateralSize;
    });
    await select('24hs');
    await panel.getByText('Garantía sin verificar', { exact: true }).waitFor();
    await contrast('TP-11', 'Garantía sin verificar', status);
    await panel.locator('.ct-ticket-position-fill').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      const group = window.mainStore.portfolioStore.detailedPositionReport.types.find(item => item.type === 'BOND');
      group.securitiesDetailed = [];
    });
    await select();
    await expectRows(['CI', '0', '—', '—'], ['24 h', '0', '—', '—']);
    await contrast('TP-10', 'Tenencia en cero', panel.locator('.ct-current').first());
    await panel.locator('.ct-ticket-position-fill').waitFor({ state: 'hidden' });

    await page.evaluate(() => {
      Object.getPrototypeOf(window.mainStore.portfolioStore).getDetailedPositionReport = () => new Promise(() => {});
    });
    await select('24hs');
    await panel.getByText('Matriz no respondió.', { exact: false }).waitFor({ timeout: 15_000 });
    await contrast('TP-12', 'Tiempo de espera agotado', status);
  } else if (group === 'theme-widgets') {
    await page.getByRole('button', { name: 'RATIOS · CHUCHOTRIZ', exact: true }).click();
    await contrast('TH-10', 'Cabecera del widget Ratios', page.locator('.ct-ratios th').first());
    await contrast('TH-11', 'Valor de un ratio del dashboard', page.locator('.ct-ratios .ct-ratios-value').first());
    const trigger = page.getByRole('button', { name: 'Gráfico intradiario de AL30' });
    await trigger.evaluate(element => {
      const header = element.closest('.NewWidgetHeader');
      Object.assign(header.parentElement.style, { position: 'absolute', top: '360px', left: '420px', width: '320px', height: '240px' });
      Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '32px' });
    });
    await trigger.focus();
    const book = page.locator('.ct-book-intraday');
    await contrast('TH-12', 'Título del Book intradiario', book.locator('strong'));
    await contrast('TH-13', 'Etiqueta del eje del Book intradiario', book.locator('svg text').first(), { foreground: 'fill' });
    // The SVG is visible even when a single trade gives the polyline a zero-height box.
    await contrast('TH-14', 'Línea de precio del Book intradiario', book.locator('.ct-book-intraday-line'),
      { foreground: 'stroke', minimum: 3, state: 'attached' });
    const placement = async (id, side, detail) => {
      await page.waitForFunction(side => {
        const widget = document.querySelector('.SecurityCardWidget').getBoundingClientRect();
        const preview = document.querySelector('.ct-book-intraday');
        const plot = preview?.querySelector('svg')?.getBoundingClientRect();
        if (!plot) return false;
        const { left, top, right, bottom } = preview.getBoundingClientRect();
        if (left < 0 || top < 0 || right > innerWidth || bottom > innerHeight || plot.bottom > bottom) return false;
        if (side === 'above') return bottom < widget.top;
        if (side === 'below') return top > widget.bottom;
        return side === 'right' ? left > widget.right : right < widget.left;
      }, side, { timeout: 3000 }).catch(error => { throw Error(`${detail}. ${error.message}`); });
      cases.push({ id, status: 'PASS', detail });
    };
    await placement('TH-16', 'above', 'El gráfico del widget abre arriba si entra completo');
    await page.evaluate(() => window.scrollTo(0, 320));
    await placement('TH-17', 'right', 'El gráfico pasa a la derecha cuando falta espacio arriba');
    const widget = page.locator('.SecurityCardWidget');
    await widget.evaluate(element => { element.style.width = '450px'; });
    await placement('TH-20', 'right', 'El gráfico sigue al widget cuando cambia su ancho');
    await widget.evaluate(element => { element.style.width = '320px'; });
    await page.setViewportSize({ width: 1024, height: 800 });
    await placement('TH-18', 'right', 'El gráfico se ajusta al ancho disponible a la derecha');
    const labels = await book.locator('svg text').evaluateAll(labels => labels.map(label => {
      const bounds = label.getBoundingClientRect(), plot = label.ownerSVGElement.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(label).fontSize) * label.getScreenCTM().a;
      return bounds.left >= plot.left && bounds.right <= plot.right && bounds.top >= plot.top && bounds.bottom <= plot.bottom && fontSize >= 8;
    }));
    if (!labels.length || labels.some(visible => !visible) || !await trigger.evaluate(element => element === document.activeElement)) {
      throw Error('El gráfico compacto debe conservar las etiquetas dentro del eje y el foco en el botón');
    }
    await contrast('TH-21', 'Etiqueta del eje del Book en ancho reducido', book.locator('svg text').first(), { foreground: 'fill' });
    await page.setViewportSize({ width: 760, height: 800 });
    await placement('TH-19', 'left', 'En el borde derecho, el gráfico aprovecha el espacio a la izquierda');
    await widget.evaluate(element => Object.assign(element.style, { left: '120px', width: '520px' }));
    await placement('TH-22', 'below', 'Sin espacio lateral, el gráfico queda debajo del libro completo');
    await page.keyboard.press('Escape');
    await book.waitFor({ state: 'hidden' });
  } else {
    throw Error(`Unknown theme group: ${group}`);
  }
  return { cases };
}
