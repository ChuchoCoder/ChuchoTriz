// Called by run.mjs through the shared Playwright MCP. Only the owned local fixture.
async (page, group) => {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/fixture\?scenario=regression$/.test(page.url())) throw Error('Local regression fixture required');
  const cases = [];
  const b = name => page.getByRole('button', { name, exact: true });
  const label = name => ['Cantidad', 'Cantidad a mostrar', 'Precio', 'Instrumento'].includes(name)
    ? page.locator('#MiniOrderForm').getByLabel(name, { exact: true }) : page.getByLabel(name, { exact: true });
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const pass = (id, detail) => cases.push({ id, status: 'PASS', detail });
  const open = () => page.getByRole('link', { name: /Configuración/ }).click();
  const openSimulator = async () => { await open(); await b('Simulador de opciones').click(); };
  const value = async (name, expected) => {
    try { await page.waitForFunction(({ name, expected }) => [...document.querySelectorAll('input')].some(e => e.getAttribute('aria-label') === name && e.value === expected), { name, expected }); }
    catch { throw Error(`${name}: expected ${expected}, got ${await label(name).inputValue()}`); }
  };
  const field = async (name, text) => { await label(name).fill(text); await label(name).press('Tab'); };
  const selectCall = () => b('Comprar DEMO CALL 100 en simulación').click();
  const edit = async (name, text) => { await b(`Editar ${name}`).click(); await label(name).fill(text); await label(name).press('Enter'); };
  const pnl = () => page.locator('.ct-sim-inspect output').first().innerText().then(text => Number(text.replace(/\s*ARS$/, '').replaceAll('.', '').replace(',', '.').replace('−', '-')));
  const reloadPosition = async () => { await b('Recargar tenencia').click(); await b('Cargando posición…').waitFor({ state: 'hidden' }); };
  const loadPosition = async () => {
    await b('Posición actual').click();
    await b('Recargar tenencia').waitFor();
    await value('Cantidad posición CALL 100', '+2');
  };
  const reset = async () => {
    await page.goto(page.url());
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('link', { name: /Configuración/ }).waitFor();
  };
  await reset();
  if (group === 'opening') {
    const menu = page.getByRole('link', { name: 'Configuración (ChuchoTriz)' });
    const source = page.url();
    const origin = new URL(source).origin;
    const destination = source + '#chuchotriz';
    equal(await menu.evaluate(link => link.href), destination, 'The menu links to ChuchoTriz on the current Matriz URL');
    const context = page.context();
    const initialTabs = new Set(context.pages());
    let openedSession;
    try {
      const [opened] = await Promise.all([
        context.waitForEvent('page', {
          predicate: async tab => tab.waitForURL(url => url.origin === origin, { waitUntil: 'commit', timeout: 6000 })
            .then(() => true, () => false),
          timeout: 6000,
        }),
        menu.click({ button: 'middle' }),
      ]);
      opened.setDefaultTimeout(6000);
      await opened.bringToFront();
      openedSession = await context.newCDPSession(opened);
      await openedSession.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      const blocked = [];
      await opened.route('**/*', route => {
        const target = new URL(route.request().url()).origin;
        if (target === origin) return route.continue();
        blocked.push(target);
        return route.abort();
      });
      await opened.routeWebSocket('**/*', socket => { blocked.push(new URL(socket.url()).origin); socket.close(); });
      await opened.waitForURL(destination);
      const panel = opened.getByRole('region', { name: 'Configuración de ChuchoTriz' });
      await panel.getByRole('button', { name: 'Ratios', exact: true, pressed: true }).waitFor();
      const theme = await page.locator('html').evaluate(html => getComputedStyle(html).colorScheme);
      await panel.and(opened.locator(`[data-color-scheme="${theme}"]`)).waitFor();
      await opened.reload();
      await panel.getByRole('button', { name: 'Ratios', exact: true, pressed: true }).waitFor();
      await panel.getByRole('button', { name: 'Volver a Matriz' }).press('Escape');
      await opened.waitForURL(source);
      await panel.waitFor({ state: 'hidden' });
      equal(blocked, [], 'The new tab makes only local fixture requests');
      equal(page.url(), source, 'The original tab keeps its URL');
      equal(await menu.getAttribute('aria-expanded'), 'false', 'The original tab stays on Matriz');
    } finally {
      await openedSession?.detach().catch(() => {});
      for (const tab of context.pages()) {
        if (!initialTabs.has(tab) && new URL(tab.url()).origin === origin) await tab.close();
      }
      await page.bringToFront();
    }
    pass('SM-01a', 'Middle click opens Ratios in a new tab, reload restores it and closing returns to Matriz');

    for (let i = 0; i < 2; i++) {
      if (i === 0) {
        await menu.focus(); await page.keyboard.press('Enter');
      } else await open();
      await page.getByRole('button', { name: 'Ratios', exact: true, pressed: true }).waitFor();
      equal(await page.getByRole('region', { name: 'Configuración de ChuchoTriz', exact: true }).count(), 1, 'One panel');
      await b('Cantidades rápidas').click(); await b('Simulador de opciones').click();
      await b('Volver a Matriz').click();
      assert(await menu.evaluate(link => link === document.activeElement), 'Closing returns focus to the ChuchoTriz menu');
    }
    pass('SM-01', 'Keyboard and mouse entry select Ratios, tools coexist and closing restores focus');
  } else if (group === 'presets') {
    // This suite explicitly exercises opt-in autocomplete; new installations default to off.
    await page.evaluate(() => chrome.storage.local.set({ 'AutocompleteInstrument:AL30': true, 'AutocompleteInstrument:GD30': true }));
    await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    const raw = 'AL30 100 200/20 300/R10 +50\nGD30 400';
    await label('Presets RAW').fill(raw); await b('Guardar cambios').click();
    await page.getByText('Cambios guardados', { exact: false }).waitFor();
    await page.reload(); await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    equal((await label('Presets RAW').inputValue()).trim(), raw, 'RAW survives reload');
    await label('Presets RAW').fill('AL30 nope'); await b('Guardar cambios').click();
    assert(await page.getByRole('alert').count() > 0, 'Invalid RAW rejected');
    await page.reload(); await open(); await b('Cantidades rápidas').click(); await b('RAW').click();
    equal((await label('Presets RAW').inputValue()).trim(), raw, 'Invalid edit did not replace saved book');
    await b('Visual').click();
    await b('Editar preset 4 de AL30').click();
    const mode = page.getByRole('group', { name: 'Modo del preset 4 de AL30' });
    const add = mode.getByRole('button', { name: 'Sumar', exact: true });
    equal(await add.getAttribute('aria-pressed'), 'true', 'RAW additive mode opens in the visual editor');
    await mode.getByRole('button', { name: 'Mostrar todo', exact: true }).click();
    await add.click();
    equal(await add.getAttribute('aria-pressed'), 'true', 'Visual editor selects Sumar');
    assert(await mode.evaluate(group => Array.from(group.querySelectorAll('button')).every(button => button.scrollWidth <= button.clientWidth + 1)), 'Mode labels fit the editor');
    await b('Guardar cambios').click();
    await page.getByText('Cambios guardados', { exact: false }).waitFor();
    await b('Volver a Matriz').click();
    const ticket = page.locator('#MiniOrderForm');
    const preset = name => ticket.getByRole('button', { name, exact: true });
    const toggle = ticket.getByRole('button', { name: 'Expandir o contraer mini formulario' });
    const displayed = label('Cantidad a mostrar');
    await page.evaluate(() => window.ctAddPresetExpansion());
    await toggle.click();
    await preset('100').click();
    equal(await label('Cantidad').inputValue(), '100', 'Whole preset fills quantity');
    equal(await displayed.count(), 0, 'Whole preset keeps collapsed panel closed');
    await preset('200/20').click();
    equal(await label('Cantidad').inputValue(), '200', 'Fixed preset quantity');
    equal(await displayed.inputValue(), '20', 'Fixed preset opens panel and fills displayed quantity');
    await preset('100').click();
    equal(await displayed.inputValue(), '', 'Whole preset clears a visible partial and keeps panel open');
    await preset('300/R10').click();
    const shown = Number(await displayed.inputValue());
    assert(shown === 30, 'Random displayed quantity inside documented range');
    await toggle.click();
    await preset('100').click();
    equal(await displayed.count(), 0, 'Removing a hidden partial keeps panel closed');
    equal(await page.evaluate(() => JSON.stringify({ displayQty: window.mainStore.uiStore.newOrderMiniPanel.displayQty })), '{}', 'Draft omits displayed quantity');
    pass('RG-01-expansion', 'Only partial presets expand; switching to Mostrar todo clears the visible or hidden partial');
    await preset('+50').click();
    equal(await label('Cantidad').inputValue(), '150', 'A plus preset adds to total');
    equal(await displayed.count(), 0, 'A plus preset keeps the panel closed');
    await preset('200/20').click();
    equal(await label('Cantidad').inputValue(), '200', 'A fixed partial preset still replaces the total');
    await preset('+50').click();
    equal(await label('Cantidad').inputValue(), '250', 'A plus preset adds above a partial');
    equal(await displayed.inputValue(), '20', 'A plus preset preserves the existing partial');
    await label('Cantidad').fill('78,14');
    await preset('+50').click();
    equal(await label('Cantidad').inputValue(), '128,14', 'A plus preset preserves the decimal quantity accepted by Matriz');
    equal(await displayed.inputValue(), '20', 'Adding to decimals preserves the existing partial');
    await preset('200/20').click();
    pass('RG-01-additive', 'The same ticket supports additive and replacement presets. Additive clicks preserve the existing partial');
    await label('Instrumento').fill('GD30 (CI)'); await label('Cantidad').fill(''); await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '400');
    await label('Instrumento').fill('AL30 (CI)'); await label('Cantidad').fill(''); await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '200');
    pass('SM-02/RG-01', 'RAW valid/invalid, reload, fixed/random display, per-instrument last preset');
    await page.evaluate(() => {
      const old = document.getElementById('MiniOrderForm'); const next = old.cloneNode(true);
      next.querySelector('#root-chuchotriz')?.remove(); next.querySelector('#cantidad').value = '';
      window.ctOldTicket = old; old.replaceWith(next); next.querySelector('#precio').focus();
    });
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '200');
    equal(await page.locator('#root-chuchotriz').count(), 1, 'One mounted preset panel');
    await ticket.getByRole('button', { name: 'Limpiar', exact: true }).click();
    equal(await label('Cantidad').inputValue(), '', 'Clear does not immediately reapply');
    await label('Precio').focus();
    await page.waitForFunction(() => document.querySelector('#cantidad').value === '100');
    await page.evaluate(() => {
      const quote = document.createElement('button'); quote.className = 'PriceCell'; quote.textContent = 'Cotización ficticia';
      quote.onclick = () => document.getElementById('precio').focus(); document.querySelector('main').append(quote);
    });
    await b('Cotización ficticia').click();
    await page.waitForFunction(() => document.activeElement === document.getElementById('cantidad'));
    await label('Precio').click();
    equal(await page.evaluate(() => document.activeElement.id), 'precio', 'Direct price click keeps focus');
    pass('SM-03', 'Form remount keeps preset, Clear forgets it, quote redirects focus and direct click does not');

    await label('Instrumento').fill('GD30 (24hs)');
    const shortcut = ticket.getByRole('button', { name: 'Configurar cantidades rápidas de GD30' });
    const quantityBefore = await label('Cantidad').inputValue();
    await shortcut.press('Enter');
    const instrument = ticker => page.getByRole('heading', { name: ticker, exact: true });
    await instrument('GD30').waitFor();
    equal(await b('Cantidades rápidas').getAttribute('aria-pressed'), 'true', 'Quick quantities tab selected');
    equal(await label('Cantidad').inputValue(), quantityBefore, 'Opening keeps the ticket quantity');
    await b('RAW').click();
    const draft = `${raw}\nGGAL ${Array.from({length: 29}, (_, index) => 123 + index).join(' ')}`;
    await label('Presets RAW').fill(draft);
    await b('Volver a Matriz').click();
    assert(await shortcut.evaluate(button => document.activeElement === button), 'Closing returns focus to the shortcut');
    await shortcut.press('Space');
    await instrument('GD30').waitFor();
    await b('RAW').click();
    equal((await label('Presets RAW').inputValue()).trim(), draft, 'The shortcut preserves a valid unsaved RAW draft');
    await label('Presets RAW').fill('GD30 inválido');
    await b('Volver a Matriz').click();
    await label('Instrumento').fill('GGAL (CI)');
    const ggalShortcut = ticket.getByRole('button', { name: 'Configurar cantidades rápidas de GGAL' });
    await ggalShortcut.click();
    equal(await label('Presets RAW').inputValue(), 'GD30 inválido', 'Invalid RAW stays available for correction');
    await page.getByRole('alert').filter({ hasText: 'Línea 1' }).waitFor();
    await label('Presets RAW').fill(draft);
    await b('Visual').click();
    await instrument('GGAL').waitFor();
    const detail = page.locator('.instrument-detail');
    assert(await detail.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollTop > 0; }), 'Long preset detail can scroll');
    await b('Volver a Matriz').click();
    await ggalShortcut.click();
    equal(await detail.evaluate(element => element.scrollTop), 0, 'Opening the shortcut shows the beginning of the preset detail');
    await b('Volver a Matriz').click();

    await label('Instrumento').fill('TICKER-NUEVO (CI)');
    await label('Precio').fill('');
    await ticket.getByRole('button', { name: 'Configurar cantidades rápidas de TICKER-NUEVO' }).click();
    await instrument('Cantidades predeterminadas para TICKER-NUEVO').waitFor();
    equal(await label('Nuevo instrumento').inputValue(), 'TICKER-NUEVO', 'Prefills new ticker even without a price');
    equal(await page.locator('.preset-preview .preset-chip').allTextContents(), ['10k/2.5k', '5k/2.5k', '1k/250', '100/25', '+100', '+500'], 'Fallback previews partial and additive presets');
    equal((await page.evaluate(() => chrome.storage.local.get('InstrumentPresets'))).InstrumentPresets['TICKER-NUEVO'], undefined, 'Opening never saves a new ticker');
    await b('Descartar cambios').click();
    await b('Volver a Matriz').click();

    await page.evaluate(() => chrome.storage.local.set({ InstrumentPresets: {
      A: [{ cantidad: 50, mostrar: 0 }], AL: [{ cantidad: 500000, mostrar: 'R6' }],
    } }));
    await label('Instrumento').fill('AL30 (CI)');
    await label('Precio').fill('70000');
    await label('Cantidad').focus();
    await ticket.getByRole('button', { name: '500k/R6', exact: true }).waitFor();
    const al30Shortcut = ticket.getByRole('button', { name: 'Configurar cantidades rápidas de AL30' });
    await al30Shortcut.click();
    await instrument('AL').waitFor();
    equal(await page.locator('.preset-preview .preset-chip').allTextContents(), ['500k/R6'], 'Editor uses the same prefix configuration as the ticket');
    await b('RAW').click();
    await label('Presets RAW').fill('A 50\nAL 500000/R6\nAL30 999');
    await b('Volver a Matriz').click();
    await al30Shortcut.click();
    await instrument('AL').waitFor();
    equal(await page.locator('.preset-preview .preset-chip').allTextContents(), ['500k/R6'], 'An unsaved exact match does not replace the active configuration');
    pass('SM-02-shortcut', 'Shortcut opens the effective configuration, preserves drafts, restores focus and previews defaults');
  } else if (group === 'autocomplete') {
    await page.evaluate(() => chrome.storage.local.set({ Autocomplete: true,
      'AutocompleteInstrument:KEEP': true, 'AutocompleteInstrument:OFF': false }));
    const ticket = page.locator('#MiniOrderForm');
    const box = ticker => ticket.getByRole('checkbox', { name: `Autocompletar para ${ticker}`, exact: true });
    const ready = async ticker => {
      await box(ticker).waitFor();
      await page.waitForFunction(ticker => {
        const input = document.querySelector(`[aria-label="Autocompletar para ${ticker}"]`);
        return input && !input.disabled;
      }, ticker);
    };
    const checked = async (ticker, expected) => {
      await ready(ticker);
      equal(await box(ticker).isChecked(), expected, `${ticker} autocomplete state`);
    };
    const change = async ticker => {
      await label('Instrumento').fill(ticker);
      await label('Cantidad').fill('');
      await label('Precio').focus();
    };
    const quantity = async expected => {
      try { await page.waitForFunction(expected => document.querySelector('#cantidad').value === expected, expected); }
      catch { throw Error(`Autocomplete quantity: expected ${expected}, got ${await label('Cantidad').inputValue()}`); }
    };
    await checked('AL30', false);
    await label('Precio').focus();
    equal(await label('Cantidad').inputValue(), '', 'Legacy global true is ignored; default off leaves empty ticket');
    await ticket.getByRole('button', { name: '100k', exact: true }).click();
    equal(await label('Cantidad').inputValue(), '100000', 'Manual preset works with autocomplete off');
    await b('Limpiar').click();
    await label('Precio').focus();
    await box('AL30').check();
    await checked('AL30', true);
    equal(await label('Cantidad').inputValue(), '', 'Enabling does not write the current ticket');
    await label('Precio').focus();
    await quantity('500000');
    pass('AC-01', 'Off by default, manual presets work, opt-in after prior focus applies on next focus only');

    await ticket.getByRole('button', { name: '100k', exact: true }).click();
    await change('GD30 (CI)'); await checked('GD30', false);
    equal(await label('Cantidad').inputValue(), '', 'Other ticker stays empty');
    await change('AL30D (CI)'); await checked('AL30D', false);
    equal(await label('Cantidad').inputValue(), '', 'Shared preset prefix does not share preference');
    await change('AL30 (CI)'); await checked('AL30', true); await quantity('100000');
    await change('AL30 (24hs)'); await checked('AL30', true); await quantity('500000');
    pass('AC-02', 'Exact ticker overrides, independent prefix matches, last-used preset and shared settlement preference');

    await page.reload(); await checked('AL30', true);
    equal(await label('Cantidad').inputValue(), '', 'Reload does not write ticket before focus');
    await label('Cantidad').fill('1234'); await label('Cantidad a mostrar').fill('123');
    await box('AL30').uncheck(); await checked('AL30', false);
    equal(await label('Cantidad').inputValue(), '1234', 'Disabling preserves total');
    equal(await label('Cantidad a mostrar').inputValue(), '123', 'Disabling preserves displayed quantity');
    await page.reload(); await checked('AL30', false);
    await label('Precio').focus();
    equal(await label('Cantidad').inputValue(), '', 'Persisted false overrides default');
    pass('AC-03', 'Reload persists true and false, toggles preserve both ticket quantities');

    await open(); await b('Cantidades rápidas').click();
    equal(await page.locator('[name="autocompleteWithFirstPreset"]').count(), 0, 'Configuration has no global autocomplete control');
    await b('Guardar cambios').click();
    await page.getByText('Cambios guardados', { exact: false }).waitFor();
    await b('Volver a Matriz').click();
    const preserved = await page.evaluate(() => chrome.storage.local.get(null));
    equal(preserved['AutocompleteInstrument:KEEP'], true, 'Preset save preserves enabled ticker');
    equal(preserved['AutocompleteInstrument:OFF'], false, 'Preset save preserves disabled ticker');
    await checked('AL30', false);
    await change('GD30 (CI)'); await checked('GD30', false);
    equal(await label('Cantidad').inputValue(), '', 'Unconfigured ticker stays empty despite legacy global true');
    await box('GD30').check(); await checked('GD30', true); await label('Precio').focus(); await quantity('300000');
    await box('GD30').uncheck(); await checked('GD30', false);
    await label('Precio').fill(''); await change('NUEVO (CI)'); await checked('NUEVO', false);
    equal(await ticket.locator('.ButtonPreset').count(), 0, 'No preset buttons for unknown ticker without price');
    await page.evaluate(() => chrome.storage.local.set({ Autocomplete: false }));
    await checked('NUEVO', false);
    await page.evaluate(() => chrome.storage.local.set({ 'AutocompleteInstrument:NUEVO': true }));
    await checked('NUEVO', true);
    await change('GD30 (CI)'); await checked('GD30', false);
    await label('Instrumento').fill('');
    await ticket.locator('.instrument-autocomplete').waitFor({ state: 'hidden' });
    pass('AC-04', 'Global control removed and legacy flag ignored; ticker preferences preserved on preset save; default off, external events and empty instrument');

    await change('AL30 (CI)'); await label('Precio').fill('70000');
    await checked('AL30', false);
    await page.evaluate(() => {
      const set = chrome.storage.local.set;
      let fail = true;
      chrome.storage.local.set = async values => {
        if (fail) { fail = false; throw Error('Simulated storage failure'); }
        return set(values);
      };
    });
    await box('AL30').click();
    await ticket.getByRole('alert').waitFor(); await checked('AL30', false);
    await box('AL30').focus(); await page.keyboard.press('Space'); await checked('AL30', true);
    equal(await ticket.getByRole('alert').count(), 0, 'Retry clears save error');
    equal(await label('Cantidad').inputValue(), '', 'Keyboard toggle preserves ticket');
    pass('AC-05', 'Failed persistence is visible, retry works with keyboard without writing quantity');

    await page.evaluate(() => {
      const set = chrome.storage.local.set;
      window.ctSaveImmediately = set;
      chrome.storage.local.set = async values => {
        await set(values);
        await new Promise(resolve => { window.ctFinishSave = resolve; });
      };
    });
    await box('AL30').uncheck();
    await page.waitForFunction(() => typeof window.ctFinishSave === 'function');
    assert(await box('AL30').isDisabled(), 'Pending save disables checkbox');
    await change('GD30 (CI)'); await checked('GD30', false);
    await page.evaluate(async () => {
      await window.ctSaveImmediately({ 'AutocompleteInstrument:AL30': true });
      window.ctFinishSave();
      chrome.storage.local.set = window.ctSaveImmediately;
    });
    await checked('GD30', false);
    await change('AL30 (CI)'); await checked('AL30', true); await quantity('500000');
    pass('AC-06', 'Delayed save remains scoped to original ticker and cannot overwrite a newer preference event');

    await page.evaluate(() => {
      const buttons = document.querySelector('#MiniOrderForm > .MiniOrderForm_buttonsBlock');
      buttons.replaceWith(buttons.cloneNode(true));
    });
    await checked('AL30', true);
    equal(await ticket.locator('#root-chuchotriz').count(), 1, 'One panel after button replacement');
    await box('AL30').uncheck(); await checked('AL30', false);
    await page.evaluate(() => {
      const form = document.getElementById('MiniOrderForm');
      const replacement = form.cloneNode(true);
      replacement.querySelector('#cantidad').value = '';
      form.replaceWith(replacement);
    });
    await checked('AL30', false);
    equal(await ticket.locator('#root-chuchotriz').count(), 1, 'One panel after form replacement');
    await box('AL30').check(); await checked('AL30', true);
    equal(await label('Cantidad').inputValue(), '', 'Replacement toggle does not fill');
    await label('Precio').focus(); await quantity('500000');
    pass('AC-07', 'Cloned button block and complete form remount preserve preference and restore working listeners');

    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const inMenu = await box('AL30').count() === 0;
      if (inMenu) await ticket.getByRole('button', { name: 'Presets de cantidad' }).press('Enter');
      const bounds = await box('AL30').boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 1000,
        `Checkbox within viewport at ${width}`);
      await box('AL30').focus(); await page.keyboard.press('Space'); await checked('AL30', false);
      await box('AL30').focus();
      await page.keyboard.press('Space'); await checked('AL30', true);
      if (inMenu) await page.keyboard.press('Escape');
    }
    pass('AC-08', 'Checkbox remains keyboard-operable inline or in the menu at 1024/1440/1920');
  } else if (group === 'mini-layout') {
    // Reproduce Matriz's existing rows and fixed form heights without broker actions.
    await page.addStyleTag({ content: `
      :where(#MiniOrderForm.ct-qa-mini-layout) {
        display:flex; align-items:center; gap:18px;
        min-height:56px; max-height:56px;
        --mini-form-button-width:76px; --mini-form-button-height:28px;
      }
      :where(#MiniOrderForm.ct-qa-mini-layout > form) {
        flex:1 1 0; min-width:0; flex-direction:column; gap:8px;
      }
      :where(#MiniOrderForm.ct-qa-mini-layout form > div) {
        display:flex; gap:12px; align-items:center; min-width:0;
      }
      :where(#MiniOrderForm.ct-qa-mini-layout form > div > div) {
        flex:0 1 162px; min-width:72px; height:46px;
      }
      :where(#MiniOrderForm.ct-qa-mini-layout form input) { box-sizing:border-box; width:100%; }
      :where(#MiniOrderForm.ct-qa-mini-layout.IsNotExpandedForm .MiniOrderForm_FormMiniOrdenPanel_row-bottom__div) { display:none; }
      :where(#MiniOrderForm.ct-qa-mini-layout > .MiniOrderForm_checkBoxesBlock) { flex:none; margin-inline-end:8px; }
      :where(#MiniOrderForm.ct-qa-mini-layout.DesktopExpanded > .MiniOrderForm_checkBoxesBlock) { min-height:62px; }
      :where(#MiniOrderForm.ct-qa-column) { gap:4px; }
      :where(#MiniOrderForm.ct-qa-column form > div > div) { height:38px; }
      :where(#MiniOrderForm.ct-qa-mini-layout > .MiniOrderForm_buttonsBlock) {
        display:flex; align-items:center; gap:8px; flex-shrink:0; width:280px;
      }
      :where(#MiniOrderForm.ct-qa-mini-layout .OrderButton) {
        width:var(--mini-form-button-width); height:var(--mini-form-button-height);
        flex-shrink:0; display:flex; align-items:center; justify-content:center;
        padding:0 7px; border:1px solid; box-sizing:border-box; white-space:nowrap;
      }
    ` });
    await page.evaluate(async () => {
      const form = document.getElementById('MiniOrderForm');
      form.classList.add('ct-qa-mini-layout');
      form.style.height = ''; form.style.left = '0'; form.style.right = '0';
      const fields = form.querySelector('form');
      fields.classList.add('MiniOrderForm_FormMiniOrdenPanel');
      const top = document.createElement('div');
      top.className = 'MiniOrderForm_FormMiniOrdenPanel_row-top__div';
      const bottom = document.createElement('div');
      bottom.className = 'MiniOrderForm_FormMiniOrdenPanel_row-bottom__div';
      const [instrument, price, quantity, shown] = [...fields.children];
      top.append(instrument, price, quantity);
      bottom.append(shown);
      for (const text of ['Cuenta', 'Monto', 'Tipo', 'Vencimiento', 'Fecha']) {
        const field = document.createElement('div');
        field.textContent = text;
        (['Cuenta', 'Monto'].includes(text) ? top : bottom).append(field);
      }
      fields.append(top, bottom);
      const block = form.querySelector('.MiniOrderForm_buttonsBlock');
      const declarations = document.createElement('div');
      declarations.className = 'MiniOrderForm_checkBoxesBlock';
      declarations.textContent = 'DDJJ';
      block.before(declarations);
      block.querySelector(':scope > .ButtonLimpiar').classList.add('OrderButton');
      for (const [name, className] of [['Vender', 'ButtonVender'], ['Comprar', 'ButtonComprar']]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = name;
        button.className = 'OrderButton ' + className; block.prepend(button);
      }
      await chrome.storage.local.set({ InstrumentPresets: { AL30: [1000, 500, 100, 50, 30, 20, 10, 5, 4, 3, 2, 1]
        .map(cantidad => ({ cantidad, mostrar: 0 })) } });
    });
    const ticket = page.locator('#MiniOrderForm');
    await label('Precio').focus();
    await ticket.getByRole('button', { name:'1k', exact:true }).waitFor();
    equal(await ticket.locator('.ButtonPreset').count(), 12, 'Twelve layout presets loaded');
    const ticketValues = () => page.locator('#MiniOrderForm input:not([type="checkbox"])').evaluateAll(es => es.map(e => e.value));
    const initialValues = await ticketValues();
    const readLayout = () => ticket.evaluate(form => {
      const rect = e => { const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
      const native = [...form.querySelectorAll('.MiniOrderForm_buttonsBlock > button')].map(rect);
      const buttons = [...form.querySelectorAll('.ButtonPreset')];
      const grid = form.querySelector('.preset-inline');
      const menu = form.querySelector('.preset-panel:popover-open');
      const trigger = form.querySelector('.preset-overflow');
      const fields = [...form.querySelectorAll('form > div > div, .MiniOrderForm_checkBoxesBlock')]
        .map(rect).filter(r => r.width && r.height);
      const inline = grid ? [...grid.children].map(rect) : [];
      const checkbox = grid?.querySelector('.instrument-autocomplete');
      const shortcut = grid?.querySelector('.preset-settings-button');
      return { form:rect(form), native, inline, fields, menu:menu && rect(menu), checkbox:checkbox && rect(checkbox),
        shortcut:shortcut && rect(shortcut),
        menuPresets:menu ? [...menu.querySelectorAll('.ButtonPreset')].map(rect) : [],
        presets:grid ? [...grid.querySelectorAll('.ButtonPreset')].map(rect) : [],
        trigger:trigger?.getClientRects().length ? rect(trigger) : null,
        overflow:grid && (grid.scrollWidth > grid.clientWidth + 1 || grid.scrollHeight > grid.clientHeight + 1),
        clippedLabels:buttons.filter(e => e.getClientRects().length &&
          e.firstElementChild.scrollWidth > e.firstElementChild.clientWidth + 1).map(e => e.textContent) };
    });
    const assertControlsFit = (layout, mode) => {
      const context = mode.name + ' at ' + mode.width;
      const [buy, sell, clear] = layout.native;
      equal(layout.form.height, mode.height, `Matriz form keeps its native height ${context}`);
      assert(clear.right < buy.x && buy.right < sell.x && Math.abs(layout.form.right - sell.right - 8) < 1,
        `Buy and sell at the far right ${context}`);
      assert(layout.inline.every(control => control.right <= clear.x &&
        layout.fields.every(r => r.right <= control.x || r.x >= control.right || r.bottom <= control.y || r.y >= control.bottom)),
        `Presets stay left of the actions and clear of the fields ${context}`);
      assert([...layout.native, ...layout.inline].every(r =>
        r.x >= layout.form.x && r.right <= layout.form.right + 1 && r.y >= layout.form.y && r.bottom <= layout.form.bottom + 1),
        `Controls fit without clipping ${context}`);
      if (layout.checkbox) {
        assert(layout.shortcut.x >= layout.checkbox.right && layout.shortcut.right <= clear.x,
          `Settings shortcut fits next to Autocomplete ${context}`);
      }
      assert(!layout.overflow, `Preset grid does not need a scrollbar ${context}`);
      equal(layout.clippedLabels, [], `Preset labels fit without truncation ${context}`);
    };
    const modes = [
      { name:'DesktopUltrawideExpanded', width:2048, height:125 },
      { name:'DesktopLargeExpanded', width:1600, height:125 },
      { name:'DesktopExpanded', width:1440, height:125 },
      { name:'DesktopUltrawideCollapsed', width:1920, height:56 },
      { name:'NotebookCollapsed', width:1024, height:56, sidePanels:true },
      { name:'NotebookExpanded', width:1024, height:140, column:true },
      { name:'TabletExpanded', width:768, height:160, column:true },
      { name:'TabletCollapsed', width:768, height:100, column:true },
    ];
    const setMode = async mode => {
      const { width } = mode;
      await page.setViewportSize({ width, height:1000 });
      await ticket.evaluate((form, {name,height,column,sidePanels}) => {
        form.className = ['ct-qa-mini-layout', name.endsWith('Expanded') ? 'ExpandedForm' : 'IsNotExpandedForm', name].join(' ');
        form.classList.toggle('ct-qa-column', !!column);
        Object.assign(form.style, {
          flexDirection:column ? 'column' : 'row',
          minHeight:`${height}px`, maxHeight:`${height}px`,
          left:sidePanels ? '40px' : '0', right:sidePanels ? '180px' : '0',
        });
      }, mode);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const nativePositions = [];
    let hasPartialOverflow = false;
    for (const mode of modes) {
      await setMode(mode);
      const layout = await readLayout();
      assertControlsFit(layout, mode);
      nativePositions.push(layout.native);
      for (let i = 1; i < layout.presets.length; i++) {
        const prior = layout.presets[i - 1], preset = layout.presets[i];
        if (Math.abs(prior.y - preset.y) < 1) assert(Math.abs(preset.x - prior.right - 8) < 1, 'Consistent horizontal spacing');
      }
      equal(await ticketValues(), initialValues, 'Layout preserves ticket values');
      if (mode.width === 2048) {
        equal(layout.presets.length, 12, 'All 12 presets fit on ultrawide desktop');
        assert(new Set(layout.presets.map(preset => preset.y)).size >= 2, 'Presets wrap to the next row');
      }
      if (mode.width === 2048 || mode.width === 1920) {
        assert(layout.checkbox && layout.presets.length > 0 && layout.presets.every(preset => preset.y >= layout.checkbox.bottom),
          'Autocomplete sits alone above the presets when they cannot share a single row');
      }
      if (layout.trigger && layout.presets.length > 0) hasPartialOverflow = true;
    }
    assert(hasPartialOverflow, 'Medium layouts keep the presets that fit, with the remaining presets in the menu');
    pass('SM-11', 'Presets wrap to the left of the actions without a scrollbar or any change to native form heights');
    await setMode(modes[0]);
    const slot = ticket.locator('.preset-slot');
    await slot.evaluate(el => { el.style.inlineSize = '76px'; });
    const narrowTrigger = ticket.getByRole('button', {name:'Presets de cantidad'});
    await narrowTrigger.waitFor();
    equal(await ticket.locator('.preset-inline .ButtonPreset').count(), 2,
      'A single column can still use its available rows for presets');
    await narrowTrigger.click();
    const narrowMenu = ticket.locator('.preset-panel:popover-open');
    await narrowMenu.getByRole('button', { name:'Configurar cantidades rápidas de AL30' }).click();
    await narrowMenu.waitFor({state:'hidden'});
    await page.getByRole('heading', {name:'AL30', exact:true}).waitFor();
    await b('Volver a Matriz').click();
    assert(await narrowTrigger.evaluate(el => document.activeElement === el), 'Closing settings restores focus to the menu trigger');
    equal(await ticketValues(), initialValues, 'Opening settings from the menu preserves ticket values');
    await narrowTrigger.click();
    await narrowMenu.waitFor();
    await narrowMenu.getByRole('button', { name:'100', exact:true }).focus();
    await slot.evaluate(el => { el.style.inlineSize = ''; });
    await ticket.locator('.preset-panel:popover-open').waitFor({state:'detached'});
    equal(await ticket.locator('.preset-inline .ButtonPreset').count(), 12,
      'Resizing moves every preset inline and closes the menu');
    equal(await ticket.locator('.preset-inline .ButtonPreset:focus').textContent(), '100',
      'A preset that moves out of the menu retains keyboard focus');
    await slot.evaluate(el => { el.style.inlineSize = '76px'; });
    await narrowTrigger.waitFor();
    assert(await narrowTrigger.evaluate(el => document.activeElement === el),
      'A preset that moves into the closed menu hands focus to its trigger');
    await narrowTrigger.click();
    await narrowMenu.getByRole('button', { name:'Configurar cantidades rápidas de AL30' }).click();
    await page.getByRole('heading', {name:'AL30', exact:true}).waitFor();
    await slot.evaluate(el => { el.style.inlineSize = ''; });
    const inlineShortcut = ticket.locator('.preset-inline .preset-settings-button');
    await inlineShortcut.waitFor();
    await b('Volver a Matriz').click();
    assert(await inlineShortcut.evaluate(el => document.activeElement === el), 'Closing settings focuses the current shortcut after reflow');
    await page.evaluate(() => {
      const save = chrome.storage.local.set;
      chrome.storage.local.set = values => {
        if (!('AutocompleteInstrument:AL30' in values)) return save(values);
        return new Promise((_, reject) => {
          window.ctRejectAutocompleteSave = () => {
            chrome.storage.local.set = save;
            reject(Error('Simulated delayed storage failure'));
          };
        });
      };
    });
    const autocomplete = ticket.getByRole('checkbox', { name:'Autocompletar para AL30' });
    await autocomplete.click();
    await page.waitForFunction(() => typeof window.ctRejectAutocompleteSave === 'function');
    await slot.evaluate(el => { el.style.inlineSize = '76px'; });
    await narrowTrigger.click();
    const menuCheckbox = narrowMenu.getByRole('checkbox', { name:'Autocompletar para AL30' });
    assert(await menuCheckbox.isDisabled(), 'A pending save stays disabled when the checkbox moves to the menu');
    await page.evaluate(() => window.ctRejectAutocompleteSave());
    await narrowMenu.getByRole('alert').waitFor();
    await slot.evaluate(el => { el.style.inlineSize = ''; });
    await inlineShortcut.waitFor();
    await ticket.locator('.preset-inline').getByRole('alert').waitFor();
    await autocomplete.check();
    await ticket.locator('.preset-inline').getByRole('alert').waitFor({state:'hidden'});
    await autocomplete.uncheck();
    pass('SM-11-autocomplete', 'A pending save and its error follow Autocomplete between the inline grid and menu');
    await ticket.locator('.ButtonComprar').focus();
    for (const className of ['ButtonVender', 'ButtonLimpiar']) {
      await page.keyboard.press('Tab');
      assert(await ticket.locator('button:focus').evaluate((el, cls) => el.classList.contains(cls), className),
        'Expanded form keeps the native action tab sequence');
    }
    await page.keyboard.press('Tab');
    equal(await ticket.locator('input[type="checkbox"]:focus').count(), 1, 'Tab reaches Autocomplete');
    await page.keyboard.press('Tab');
    equal(await ticket.locator('.preset-settings-button:focus').count(), 1, 'Tab reaches preset settings');
    await page.keyboard.press('Tab');
    equal(await ticket.locator('.ButtonPreset:focus').textContent(), '1k', 'Tab reaches the first preset');
    await page.evaluate(() => chrome.storage.local.set({ InstrumentPresets: { GD30: [{cantidad:400, mostrar:0}] } }));
    await label('Instrumento').fill('GD30 (CI)'); await label('Precio').focus();
    await ticket.getByRole('button', { name:'400', exact:true }).waitFor();
    const singleRow = await readLayout();
    assert(singleRow.checkbox && singleRow.checkbox.bottom > singleRow.presets[0].y && singleRow.checkbox.right <= singleRow.presets[0].x,
      'Autocomplete shares the row when the controls all fit');
    await page.evaluate(() => chrome.storage.local.set({ InstrumentPresets: undefined }));
    await label('Instrumento').fill('AO20 (CI)'); await label('Precio').focus();
    await ticket.getByRole('button', { name:'300k/100k', exact:true }).waitFor();
    equal(await ticket.locator('.ButtonPreset').count(), 10, 'Ten default AO2 presets loaded');
    for (const [i, mode] of modes.entries()) {
      await setMode(mode);
      const layout = await readLayout();
      assertControlsFit(layout, mode);
      equal(layout.native, nativePositions[i], 'Changing instrument and preset count preserves action coordinates');
    }
    pass('SM-11-labels', 'Ten default AO2 presets remain legible, with action coordinates unchanged');
    await setMode(modes.find(mode => mode.sidePanels));
    const overflowButton = ticket.getByRole('button', {name:'Presets de cantidad'});
    await overflowButton.waitFor();
    equal(await overflowButton.getAttribute('aria-expanded'), 'false', 'Compact menu starts collapsed');
    await ticket.locator('.ButtonComprar').focus();
    for (const className of ['ButtonVender', 'ButtonLimpiar']) {
      await page.keyboard.press('Tab');
      equal(await ticket.locator('button:focus').evaluate((el, cls) => el.classList.contains(cls), className), true,
        'Compact form keeps native actions together in the tab sequence');
    }
    await page.keyboard.press('Tab');
    equal(await ticket.locator('.preset-inline .ButtonPreset:focus').textContent(), '300k/100k',
      'Tab reaches the preset in the first available row');
    await page.keyboard.press('Tab');
    assert(await overflowButton.evaluate(el => document.activeElement === el), 'Tab reaches the compact preset menu');
    await page.keyboard.press('Enter');
    await ticket.locator('.preset-panel:popover-open').waitFor();
    const opened = await readLayout();
    assert(opened.menuPresets.every(preset => preset.x >= opened.menu.x && preset.right <= opened.menu.right),
      'Menu wraps its presets without horizontal scrolling');
    assert(Math.abs(opened.menu.bottom - opened.form.y) < 1, 'Preset menu is anchored above the form');
    equal(opened.form.height, 56, 'Opening the preset menu preserves the native form height');
    await page.keyboard.press('Escape');
    await ticket.locator('.preset-panel:popover-open').waitFor({state:'hidden'});
    await page.waitForFunction(() => document.querySelector('.preset-overflow').getAttribute('aria-expanded') === 'false');
    await overflowButton.click();
    await ticket.getByRole('button', { name:'100k/50k', exact:true }).click();
    await ticket.locator('.preset-panel:popover-open').waitFor({state:'hidden'});
    equal(await label('Cantidad').inputValue(), '100000', 'Choosing a preset closes the menu and fills the ticket');
    pass('SM-11-column', 'Compact and column layouts keep the native action row with a keyboard-accessible menu in tight space');

    await page.evaluate(() => chrome.storage.local.set({ InstrumentPresets: { LONG: Array.from({ length: 360 },
      (_, index) => ({ cantidad: index + 1, mostrar: 0 })) } }));
    await label('Instrumento').fill('LONG (CI)'); await label('Precio').focus();
    await overflowButton.click();
    const longMenu = ticket.locator('.preset-panel:popover-open');
    const lastPreset = longMenu.getByRole('button', { name: '360', exact: true });
    await lastPreset.scrollIntoViewIfNeeded();
    assert(await longMenu.evaluate(el => el.scrollTop > 0 && el.scrollWidth <= el.clientWidth + 1),
      'Long preset lists can scroll vertically within the overflow menu');
    await lastPreset.click();
    equal(await label('Cantidad').inputValue(), '360', 'Last preset remains reachable in a long list');
    assertControlsFit(await readLayout(), modes.find(mode => mode.sidePanels));
    pass('SM-11-menu', 'Long preset lists stay reachable from the menu without scrolling the ticket');

    await setMode(modes[0]);
    await page.evaluate(() => chrome.storage.local.set({ InstrumentPresets: { CUSTOM: [
      { cantidad: 1234567, mostrar: 1012345 }, { cantidad: 500, mostrar: 0 }, { cantidad: 1234567, mostrar: 1023456 },
    ] } }));
    await label('Instrumento').fill('CUSTOM (CI)'); await label('Precio').focus();
    const inline = ticket.locator('.preset-inline');
    await inline.getByRole('button', {name:'500', exact:true}).waitFor();
    equal(await inline.locator('.ButtonPreset').allTextContents(), ['500'], 'Only presets with room for the full label are inline');
    await overflowButton.click();
    equal(await longMenu.locator('.ButtonPreset').allTextContents(), ['1.234567m/1.012345m', '1.234567m/1.023456m'],
      'The menu displays both quantities in full and preserves their order');
    equal((await readLayout()).clippedLabels, [], 'Long labels remain fully legible');
    await longMenu.getByRole('button', {name:'1.234567m/1.023456m', exact:true}).click();
    equal(await label('Cantidad').inputValue(), '1234567', 'The chosen preset fills its total');
    equal(await label('Cantidad a mostrar').inputValue(), '1023456', 'The chosen preset fills its exact displayed quantity');
    pass('SM-11-long-labels', 'Different quantities with long labels remain distinguishable and apply exactly');

    await label('Instrumento').fill(''); await label('Precio').focus();
    await page.waitForFunction(() => !document.querySelector('#MiniOrderForm .ButtonPreset'));
    for (const [i, mode] of modes.entries()) {
      await setMode(mode);
      const layout = await readLayout();
      assertControlsFit(layout, mode);
      equal(layout.native, nativePositions[i], 'Hiding presets preserves action coordinates');
    }
    pass('SM-11-empty', 'Empty ticket preserves the coordinates of the action buttons');
  } else if (group === 'quotes') {
    await openSimulator();
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.md.ask = undefined; c.md.asz = undefined; c.md.lst = 9; c.md.seq++; });
    await page.waitForFunction(() => document.querySelector('[aria-label="Comprar DEMO CALL 100 en simulación"]')?.innerText.includes('—'));
    await selectCall(); equal(await b('Editar Precio pata 1').innerText(), '9', 'Missing ask uses last trade');
    await selectCall(); equal(await b('Quitar pata 1').count(), 0, 'Repeated quote deselects');
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.md.lst = undefined; c.md.seq++; });
    // Wait on the public last-price cell, then choose the unavailable quote.
    await label('Cambiar columna Volumen nominal de Calls').selectOption('last');
    await page.waitForFunction(() => document.querySelector('[aria-label="Último precio operado DEMO CALL 100"]').textContent === '—');
    await selectCall(); equal(await b('Editar Precio pata 1').innerText(), '—', 'Missing ask and last require manual premium');
    const load = b('Cargar Op. · compra de DEMO CALL 100 en el Mini Order Form');
    assert(await load.isDisabled(), 'Cannot preload absent quote');
    await b('Fijar 10 contratos').click();
    await b('Vender DEMO PUT 100 en simulación').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+10', '−1'], 'Call buy and put sell sides');
    pass('SM-04', 'Call/put selection, deselection, last-trade fallback, missing premium and blocked preload');
    const strike = value => page.locator(`tr[data-option-strike="${value}"] th[scope="row"]`);
    const dragQuote = async (source, target, { highlight, cancel = false } = {}) => {
      await source.scrollIntoViewIfNeeded();
      await target.scrollIntoViewIfNeeded();
      const from = await source.boundingBox(), to = await target.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      try {
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
        if (highlight) await page.locator(`tr[data-option-strike="${highlight}"] th.ct-opt-strike-target`).waitFor();
        if (cancel) await page.keyboard.press('Escape');
      } finally {
        await page.mouse.up();
      }
    };
    const ask100 = b('Comprar DEMO CALL 100 en simulación'), ask120 = b('Comprar DEMO CALL 120 en simulación');
    const bid100 = b('Vender DEMO PUT 100 en simulación'), bid90 = b('Vender DEMO PUT 90 en simulación');
    equal(await ask120.getAttribute('draggable'), 'false', 'Unselected quote cannot start a drag');
    await dragQuote(ask100, strike(120), { highlight: 120, cancel: true });
    equal(await ask100.getAttribute('aria-pressed'), 'true', 'Escape leaves the source selected');
    equal(await ask120.getAttribute('aria-pressed'), 'false', 'Escape cancels the move');
    equal(await page.locator('.ct-opt-strike-target').count(), 0, 'Escape clears the highlight');
    await dragQuote(ask100, b('Vender DEMO PUT 120 en simulación'));
    equal(await ask100.getAttribute('aria-pressed'), 'true', 'Other type and side cannot receive the drag');
    await dragQuote(ask100, ask120, { highlight: 120 });
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'ASK moves to higher strike');
    equal(await ask100.getAttribute('aria-pressed'), 'false', 'Original quote is deselected');
    equal(await b('Editar Contratos pata 1').innerText(), '+10', 'Move retains selected quantity');
    equal(await b('Editar Precio pata 1').innerText(), '4,1', 'Move uses destination ASK');
    await dragQuote(ask120, strike(100));
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'Drop rejected when the destination has no ASK');
    await page.evaluate(() => {
      const put = window.mainStore.securityStore.options.find(option => option.id === 'put-100');
      put.md.bid = put.md.ask;
      put.md.seq++;
    });
    await page.waitForFunction(() => document.querySelector('[aria-label="Vender DEMO PUT 100 en simulación"]').title.includes('cerrado o cruzado'));
    assert(await b('Comprar DEMO PUT 100 en simulación').isDisabled(), 'Cannot select the other side of a crossed book');
    await bid100.hover();
    assert(await b('Cargar Op. · venta de DEMO PUT 100 en el Mini Order Form').isDisabled(), 'Cannot preload a crossed quote');
    await dragQuote(bid100, strike(90), { highlight: 90 });
    equal(await bid90.getAttribute('aria-pressed'), 'true', 'BID moves to lower strike');
    equal(await b('Editar Precio pata 2').innerText(), '5,9', 'Move uses destination BID');
    await b('Vender DEMO CALL 110 en simulación').click();
    await dragQuote(ask120, strike(110));
    equal(await ask120.getAttribute('aria-pressed'), 'true', 'Drop rejected when the contract already has a leg');
    equal(await b('Vender DEMO CALL 110 en simulación').getAttribute('aria-pressed'), 'true', 'Existing leg is preserved');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    await page.getByText('VI por pata', { exact: true }).click();
    equal(await b('Editar VI pata 1').innerText(), '45,00', 'Move uses destination IV');
    pass('SM-04-drag', 'Native BID/ASK drag reprices the leg, handles crossed source and Escape, and rejects mismatched, missing or occupied targets');
  } else if (group === 'columns') {
    await openSimulator(); await b('Configurar cadena de opciones').click();
    await page.getByRole('checkbox', { name: 'Volumen nominal', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Mid', exact: true }).check();
    await b('Mover Mid hacia el borde').click(); await b('Listo').click();
    const columns = () => page.locator('select[aria-label^="Cambiar columna"]').evaluateAll(es => es.map(e => e.value));
    const reloadColumns = async expected => {
      await page.reload(); await openSimulator();
      await page.waitForFunction(expected => {
        const values = [...document.querySelectorAll('select[aria-label^="Cambiar columna"]')].map(element => element.value);
        return JSON.stringify(values) === JSON.stringify(expected);
      }, expected);
    };
    const expected = await columns();
    assert(expected.includes('mid') && !expected.includes('volume'), 'Columns changed');
    equal(expected.slice(0, expected.length / 2), expected.slice(expected.length / 2).reverse(), 'Mirrored call/put columns');
    await reloadColumns(expected);
    await label('Cambiar columna Mid de Calls').selectOption('volume');
    equal(await label('Cambiar columna Volumen nominal de Puts').inputValue(), 'volume', 'Header change mirrored');
    for (const fixed of ['BID · Vender', 'ASK · Comprar', 'VI', 'Strike']) assert(await page.getByRole('columnheader', { name: fixed, exact: true }).count() > 0, `Fixed ${fixed}`);
    pass('SM-05', 'Hide/show/reorder, reload persistence, mirrored header replacement and fixed columns');
    await b('Configurar cadena de opciones').click();
    for (const name of ['Extrínseco Bid', 'Extrínseco Ask']) await page.getByRole('checkbox', { name, exact: true }).check();
    const beforeMove = await columns();
    const movedCalls = beforeMove.slice(0, beforeMove.length / 2);
    const bidIndex = movedCalls.indexOf('extrinsicBid');
    assert(bidIndex > 0, 'Bid can move toward the edge');
    [movedCalls[bidIndex - 1], movedCalls[bidIndex]] = [movedCalls[bidIndex], movedCalls[bidIndex - 1]];
    await b('Mover Extrínseco Bid hacia el borde').click(); await b('Listo').click();
    const extrinsicColumns = await columns();
    equal(extrinsicColumns, [...movedCalls, ...movedCalls.toReversed()], 'Bid actually moves and both sides mirror the new order');
    await reloadColumns(extrinsicColumns);
    await label('Cambiar columna Extrínseco Bid de Calls').selectOption('extrinsicAsk');
    const swapped = await columns();
    const swappedCalls = movedCalls.map(column => column === 'extrinsicBid' ? 'extrinsicAsk' : column === 'extrinsicAsk' ? 'extrinsicBid' : column);
    equal(swapped, [...swappedCalls, ...swappedCalls.toReversed()], 'Bid/Ask actually swap positions and both sides mirror the new order');
    const metric = async (name, expected) => {
      await page.waitForFunction(({ name, expected }) => document.querySelector(`[aria-label="${name}"]`)?.textContent === expected, { name, expected });
    };
    for (const kind of ['CALL', 'PUT']) {
      await metric(`Extrínseco Bid DEMO ${kind} 100`, '7,9');
      await metric(`Extrínseco Ask DEMO ${kind} 100`, '8,1');
    }
    pass('SM-05-extrinsic-columns', 'Bid/Ask columns selectable, reorderable, persisted, mirrored and swappable from headers');
    await page.evaluate(() => {
      const options = window.mainStore.securityStore.options;
      const call = options.find(c => c.id === 'call-90');
      Object.assign(call.md, { bid: 8, bsz: 100, ask: undefined, asz: undefined }); call.md.seq++;
      const put = options.find(c => c.id === 'put-110');
      Object.assign(put.md, { bid: undefined, bsz: undefined, ask: 10, asz: 100 }); put.md.seq++;
      for (const id of ['call-110', 'put-90']) {
        const c = options.find(c => c.id === id);
        Object.assign(c.md, { bid: 1.25, bsz: 100, ask: 1.75, asz: 100 }); c.impliedVolatility = undefined; c.md.seq++;
      }
    });
    await metric('Extrínseco Bid DEMO CALL 90', '-2'); await metric('Extrínseco Ask DEMO CALL 90', '—');
    await metric('Extrínseco Bid DEMO PUT 110', '—'); await metric('Extrínseco Ask DEMO PUT 110', '0');
    for (const symbol of ['CALL 110', 'PUT 90']) {
      await metric(`Extrínseco Bid DEMO ${symbol}`, '1,25'); await metric(`Extrínseco Ask DEMO ${symbol}`, '1,75');
    }
    pass('SM-05-extrinsic-values', 'ATM/ITM/OTM calls and puts, one-sided books, zero/negative extrinsic and missing VI');
    await page.evaluate(() => {
      const options = window.mainStore.securityStore.options;
      const call = options.find(c => c.id === 'call-100'); call.md.bsz = 0; call.md.seq++;
      const put = options.find(c => c.id === 'put-100'); put.md.ask = 0; put.md.seq++;
    });
    await metric('Extrínseco Bid DEMO CALL 100', '—'); await metric('Extrínseco Ask DEMO CALL 100', '8,1');
    await metric('Extrínseco Bid DEMO PUT 100', '7,9'); await metric('Extrínseco Ask DEMO PUT 100', '—');
    await page.evaluate(() => { window.mainStore.webSocketConnectionStatus = false; });
    for (const kind of ['CALL', 'PUT']) {
      await metric(`Extrínseco Bid DEMO ${kind} 100`, '—'); await metric(`Extrínseco Ask DEMO ${kind} 100`, '—');
    }
    await page.evaluate(() => {
      window.mainStore.webSocketConnectionStatus = true;
      const options = window.mainStore.securityStore.options;
      const call = options.find(c => c.id === 'call-100'); call.md.bsz = 100; call.md.seq++;
      const put = options.find(c => c.id === 'put-100'); put.md.ask = 8.1; put.md.seq++;
    });
    await metric('Extrínseco Bid DEMO CALL 100', '7,9'); await metric('Extrínseco Ask DEMO PUT 100', '8,1');
    pass('SM-05-extrinsic-freshness', 'Invalid own price/size hides only that side; disconnect clears metrics and reconnect restores them');
  } else if (group === 'tooltip') {
    await openSimulator(); const trigger = b('VI 35,00 % · DEMO CALL 100');
    await trigger.click();
    await page.getByRole('tooltip').getByText('Probabilidad teórica al vencimiento', { exact: true }).waitFor();
    const text = (await page.getByRole('tooltip').innerText()).replace(/\s/g, ' ');
    for (const term of ['48 %', '52 %', 'Delta', 'Theta', 'Gamma', 'Vega']) assert(text.includes(term), `Tooltip ${term}`);
    await page.keyboard.press('Escape'); equal(await page.getByRole('tooltip').count(), 0, 'Escape closes');
    await trigger.click(); await page.getByRole('heading', { name: 'ChuchoTriz', exact: true }).click();
    equal(await page.getByRole('tooltip').count(), 0, 'Outside click closes');
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-100'); c.impliedVolatility = undefined; c.md.seq++; });
    await b('VI sin dato · DEMO CALL 100').click();
    await page.getByRole('tooltip').getByText(/Probabilidades y griegas teóricas no disponibles/).waitFor();
    equal(await page.getByRole('tooltip').getByText('Delta', { exact: true }).count(), 0, 'No invented Greeks without IV');
    pass('SM-06', 'IV tooltip values, Escape/outside dismissal, missing-IV state');
  } else if (group === 'preload') {
    for (const [side, verb, price] of [['buy', 'Comprar', '8.1'], ['sell', 'Vender', '7.9']]) {
      await reset(); await openSimulator();
      await b(`${verb} DEMO CALL 100 en simulación`).click();
      await b('Fijar 10 contratos').click();
      await b(`Cargar Op. · ${side === 'buy' ? 'compra' : 'venta'} de DEMO CALL 100 en el Mini Order Form`).click();
      await page.waitForFunction(price => document.querySelector('#cantidad').value === '10' && Number(document.querySelector('#precio').value.replace(',', '.')) === Number(price), price);
      equal(await label('Instrumento').inputValue(), 'DEMO CALL 100', 'Native ticket instrument');
      await page.locator('#MiniOrderForm').getByRole('button', { name: 'Limpiar', exact: true }).click();
    }
    await openSimulator(); await b('Editar Precio pata 1').click(); await label('Precio pata 1').fill('1'); await label('Precio pata 1').press('Enter');
    await b('Cargar venta de la pata 1 en el Mini Order Form').click();
    await page.waitForFunction(() => document.querySelector('#precio').value === '1' && document.querySelector('#cantidad').value === '10');
    await page.locator('#MiniOrderForm').getByRole('button', { name: 'Limpiar', exact: true }).click();
    pass('SM-10', 'BID/ASK preload quantity 10 and edited leg price; only fake ticket, cleared');
  } else if (group === 'position') {
    await openSimulator(); await loadPosition();
    await value('Cantidad posición CALL 110', '−1');
    await value('Prima histórica CALL 100', '');
    await b('Cotizaciones').click(); await selectCall();
    await b('Posición actual').click(); await b('Cotizaciones').click();
    equal(await b('Editar Contratos pata 1').innerText(), '+1', 'Adjustment kept across modes');
    pass('SM-08', 'Imported +2/-1 position, unknown premiums blank, adjustments survive mode switches');
  } else if (group === 'operations') {
    await page.evaluate(() => chrome.storage.local.set({ OptionsOperationsLocale:'es-AR' }));
    await open(); await b('Operaciones de opciones').click();
    await b('Copiar Calls y Puts').waitFor();
    const numberFormat = page.getByRole('combobox', { name:'Formato de números', exact:true });
    const dateFormat = page.getByRole('combobox', { name:'Formato de fecha', exact:true });
    equal(await numberFormat.inputValue(), 'es-AR', 'Legacy preference retained for numbers');
    equal(await dateFormat.inputValue(), 'es-AR', 'Legacy preference retained for dates');
    const grouping = page.getByRole('checkbox', { name: 'Agrupar por strike', exact: true });
    assert(await grouping.isChecked(), 'Executions grouped by default');
    equal(await page.getByRole('table', { name: 'Calls', exact: true }).locator('tbody tr').count(), 2, 'Grouped call rows');
    await grouping.uncheck();
    await b('Cantidades rápidas').click();
    await page.evaluate(async () => {
      const store = window.mainStore.orderEventStore;
      const rows = await store.getOrderEventsForAccountReport('DEMO-NO-BROKER');
      store.getOrderEventsForAccountReport = async () => rows.filter(row => row.id !== 2);
    });
    await b('Operaciones de opciones').click();
    await b('Copiar Calls y Puts').waitFor();
    assert(await grouping.isChecked(), 'Grouping defaults on re-entry');
    const callQuantities = await page.getByRole('table', { name: 'Calls', exact: true }).locator('tbody tr td:nth-child(2)').allTextContents();
    assert(callQuantities.includes('2') && !callQuantities.includes('8'), 'Re-entry reads the updated report automatically');
    await page.evaluate(() => {
      const store = window.mainStore.orderEventStore;
      const read = store.getOrderEventsForAccountReport;
      store.getOrderEventsForAccountReport = async account => {
        const rows = await read(account);
        return [...rows, { ...rows.find(row => row.id === 1), id: 2, lastQty: 6, lastPx: 16 }];
      };
    });
    await b('Actualizar desde Matriz').click();
    await b('Copiar Calls y Puts').waitFor();
    await grouping.uncheck();
    await numberFormat.selectOption('es-AR');
    await dateFormat.selectOption('es-AR');
    const displayedRows = [];
    for (const kind of ['Calls', 'Puts']) {
      displayedRows.push(...await page.getByRole('table', { name:kind, exact:true }).locator('tbody tr')
        .evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))));
    }
    await page.evaluate(() => { window.ctCopyOriginal = navigator.clipboard.writeText; window.ctCopy = ''; navigator.clipboard.writeText = async text => { window.ctCopy = text; }; });
    try {
      await b('Copiar Calls y Puts').click(); await page.waitForFunction(() => window.ctCopy.length > 0);
      const copy = await page.evaluate(() => window.ctCopy);
      const data = copy.split('\n').filter(line => line.includes('\t')).map(line => line.split('\t'));
      equal(data, displayedRows, 'Copied operation dates, signed quantities, strikes, premiums match the tables');
      assert(copy.includes('OPERACIONES CALLS') && copy.includes('OPERACIONES PUTS'), 'Both sections');
      await page.evaluate(async () => {
        const store = window.mainStore.orderEventStore;
        const rows = await store.getOrderEventsForAccountReport('DEMO-NO-BROKER');
        const call = rows.find(row => row.securityId.startsWith('call-'));
        const put = rows.find(row => row.securityId.startsWith('put-'));
        for (const row of [call, put]) {
          const contract = await window.mainStore.securityStore.getSecurity(row.securityId);
          contract.refData.strikePrice = 1234.5; contract.refData.maturityDateStr = '20261218';
        }
        const transactTime = new Date(2026, 10, 16, 12).toISOString();
        store.getOrderEventsForAccountReport = async () => [
          { ...call, id:101, lastQty:2, lastPx:1234.56, transactTime },
          { ...put, id:102, lastQty:3, lastPx:12.75, transactTime },
        ];
      });
      await b('Actualizar desde Matriz').click(); await b('Copiar Calls y Puts').waitFor();
      for (const numbers of ['es-AR', 'en-US']) {
        for (const dates of ['es-AR', 'en-US']) {
          await numberFormat.selectOption(numbers); await dateFormat.selectOption(dates);
          const operationDate = dates === 'es-AR' ? '16/11/2026' : '11/16/2026';
          const expiry = dates === 'es-AR' ? '18/12/2026' : '12/18/2026';
          const strike = numbers === 'es-AR' ? '1.234,5' : '1,234.5';
          const premium = numbers === 'es-AR' ? '1.234,56' : '1,234.56';
          const putPremium = numbers === 'es-AR' ? '12,75' : '12.75';
          const tableCells = kind => page.getByRole('table', { name:kind, exact:true }).locator('tbody td').allTextContents();
          equal(await tableCells('Calls'), [operationDate, '2', strike, premium], `Call grid ${numbers}/${dates}`);
          equal(await tableCells('Puts'), [operationDate, '-3', strike, putPremium], `Put grid ${numbers}/${dates}`);
          equal(await page.locator('.ct-operations-group time').innerText(), expiry, 'Displayed header expiry');
          const callLine = `${operationDate}\t2\t${strike}\t${premium}`, putLine = `${operationDate}\t-3\t${strike}\t${putPremium}`;
          for (const [scope, expected] of [['Calls', callLine], ['Puts', putLine],
            ['both', `OPERACIONES CALLS (SIN PROMEDIOS)\n${callLine}\n\nOPERACIONES PUTS (SIN PROMEDIOS)\n${putLine}`]]) {
            await page.evaluate(() => { window.ctCopy = ''; });
            const copyButton = scope === 'both'
              ? page.locator('.ct-operations-group > .ct-operations-heading > .ct-operations-copy-button')
              : page.locator('.ct-operations-side').filter({ has:page.getByRole('table', { name:scope, exact:true }) }).locator('.ct-operations-copy-button');
            await copyButton.click(); await page.waitForFunction(() => window.ctCopy.length > 0);
            equal(await page.evaluate(() => window.ctCopy), expected, `${scope} clipboard ${numbers}/${dates}`);
          }
        }
      }
      pass('SM-09-formats', 'Independent date/number combinations update both grids, header and raw clipboard for Calls, Puts and both');
    } finally { await page.evaluate(() => { navigator.clipboard.writeText = window.ctCopyOriginal; delete window.ctCopyOriginal; delete window.ctCopy; }); }
    pass('SM-09', 'Automatic load/re-entry refresh, grouping by default, manual refresh and clipboard over synthetic executions');
    await numberFormat.selectOption('es-AR'); await dateFormat.selectOption('en-US');
    await page.reload(); await open(); await b('Operaciones de opciones').click(); await b('Copiar Calls y Puts').waitFor();
    equal(await numberFormat.inputValue(), 'es-AR', 'Number preference survives reload');
    equal(await dateFormat.inputValue(), 'en-US', 'Date preference survives reload independently');
    pass('SM-09-format-storage', 'Legacy regional setting inherited and independent mixed preferences preserved across reload');
  } else if (group === 'analysis') {
    await openSimulator(); await selectCall();
    const outputs = () => page.locator('.ct-sim-inspect output').allTextContents();
    const before = await outputs(); await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    equal(await outputs(), before, 'Shared analysis results');
    equal(await page.locator('.ct-sim-scenario-results tbody tr').count(), 25, '25 scenarios');
    await b('Fecha Vencimiento').click(); const expiry = await outputs(); equal(expiry[0], expiry[1], 'Theory equals payoff at expiry');
    const path = () => page.locator('.ct-sim-chart .ct-sim-expiry-line').getAttribute('d');
    const auto = await path(); await b('Ampliar rango de precios').click(); assert(await path() !== auto, 'Zoom changes curve coordinates');
    await b('Ajustar').click(); equal(await path(), auto, 'Fit restores auto extent');
    await page.getByText('Supuestos de valuación', { exact: true }).click();
    assert((await label('Tasa automática de valuación').innerText()).includes('Caución ARS 7 días'), 'Automatic caucion reference');
    await label('Origen de la tasa').selectOption('manual'); await field('Tasa anual continua %', '30');
    await label('Origen de la tasa').selectOption('automatic'); await label('Origen de la tasa').selectOption('manual');
    equal(await label('Tasa anual continua %').inputValue(), '30', 'Manual rate survives switching');
    pass('SM-07/RG-08', 'Shared views, 25 scenarios, expiry, zoom/fit and automatic/manual rate');
  } else if (group === 'oracle') {
    await openSimulator(); await b('+ Pata manual').click();
    await edit('Precio pata 1', '8'); await edit('Strike pata 1', '100');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    await page.getByText('Supuestos de valuación', { exact: true }).click();
    await field('Precio de referencia', '100'); await field('Factor monetario por contrato', '100');
    await field('Gastos de entrada totales', '0'); await b('Fecha Vencimiento').click();
    for (const [price, expected] of [['90', -800], ['100', -800], ['110', 200]]) { await field('Precio del escenario', price); equal(await pnl(), expected, `Long call at ${price}`); }
    await page.getByRole('tab', { name: 'Armado', exact: true }).click(); await edit('Contratos pata 1', '-1');
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    for (const [price, expected] of [['90', 800], ['100', 800], ['110', -200]]) { await field('Precio del escenario', price); equal(await pnl(), expected, `Short call at ${price}`); }
    pass('RG-04', 'Independent manual call payoff oracle at 90/100/110, long and short');
  } else if (group === 'editing') {
    await openSimulator(); await selectCall();
    const quantities = await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents();
    const premium = await b('Editar Precio pata 1').innerText();
    await page.getByRole('tab', { name: 'Análisis', exact: true }).click();
    const before = await page.locator('.ct-sim-inspect output').allTextContents();
    await page.getByText('VI por pata', { exact: true }).click(); await edit('VI pata 1', '45');
    const after = await page.locator('.ct-sim-inspect output').allTextContents();
    equal(after[0], before[0], 'Per-leg IV does not change expiry P&L');
    assert(after[1] !== before[1], 'Per-leg IV changes theoretical P&L');
    await page.getByRole('tab', { name: 'Armado', exact: true }).click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), quantities, 'IV preserves contracts');
    equal(await b('Editar Precio pata 1').innerText(), premium, 'IV preserves entry premium');
    await b('Quitar pata 1').click(); equal(await b('Quitar pata 1').count(), 0, 'Remove leg');
    pass('RG-03-editing', 'Per-leg IV changes only theoretical value; premium/quantity preserved; remove leg');
  } else if (group === 'accounting') {
    await openSimulator(); await loadPosition();
    await field('Prima histórica CALL 100', '8'); await field('Prima histórica CALL 110', '6');
    await field('Costo promedio por nominal', '90'); await field('Gastos de la posición', '40'); await field('Resultado realizado neto', '200');
    await label('Incluir posición actual en Análisis').check(); equal(await pnl(), 160, 'Position expiry includes premiums/nominals/costs/realized');
    await field('Nominales del subyacente', '200'); equal(await pnl(), 1160, 'Edited nominal quantity adds 1000 at spot');
    await reloadPosition(); await value('Nominales del subyacente', '100'); equal(await pnl(), 160, 'Reload restores broker quantity and saved cost');
    await b('Cotizaciones').click(); await selectCall();
    await label('Incluir posición actual en Análisis').uncheck(); equal(await pnl(), -810, 'Adjustment alone excludes historical costs');
    await label('Incluir posición actual en Análisis').check(); equal(await pnl(), -650, 'Position plus adjustment without duplicate costs');
    await page.reload(); await openSimulator(); await loadPosition();
    await value('Prima histórica CALL 100', '8'); await value('Prima histórica CALL 110', '6');
    await value('Costo promedio por nominal', '90'); await value('Gastos de la posición', '40'); await value('Resultado realizado neto', '200');
    pass('RG-05', 'Independent total 160, edited nominals 1160, isolated adjustment -810, combined -650, saved accounting survives reload');
  } else if (group === 'scope') {
    await openSimulator(); await loadPosition(); await field('Prima histórica CALL 100', '8');
    await page.evaluate(() => { window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed[0].detailedPositions[0].totalCurrentSize = 3; });
    await reloadPosition(); await value('Cantidad posición CALL 100', '+3'); await value('Prima histórica CALL 100', '8');
    await b('Ver aviso de prima histórica CALL 100').click(); await b('Confirmar prima histórica CALL 100').click();
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-SECOND'; });
    await reloadPosition(); await value('Prima histórica CALL 100', '');
    await field('Prima histórica CALL 100', '12');
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-NO-BROKER'; });
    await reloadPosition(); await value('Prima histórica CALL 100', '8');
    await page.evaluate(() => { window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed[0].detailedPositions[0].totalCurrentSize = -3; });
    await reloadPosition(); await value('Cantidad posición CALL 100', '−3'); await value('Prima histórica CALL 100', '');
    pass('RG-06', 'Changed quantity retains premium for review, account cost separation, side reversal clears premium');
    await reset();
    // Extend only the fake external catalogue/report with a second maturity.
    await page.evaluate(() => {
      const store = window.mainStore.securityStore;
      const maturity = new Date(); maturity.setDate(maturity.getDate() + 60);
      const stamp = `${maturity.getFullYear()}${String(maturity.getMonth() + 1).padStart(2, '0')}${String(maturity.getDate()).padStart(2, '0')}`;
      const next = store.options.map(option => ({ ...option, id: 'next-' + option.id, symbolStr: 'NEXT ' + option.symbolStr,
        fixSymbol: 'NEXT ' + option.fixSymbol, refData: { ...option.refData, maturityDateStr: stamp }, md: { ...option.md } }));
      store.options = [...store.options, ...next];
      const originalFind = store.findSecurityFromId, originalGet = store.getSecurity;
      store.findSecurityFromId = id => next.find(option => option.id === id) ?? originalFind(id);
      store.getSecurity = async id => next.find(option => option.id === id) ?? originalGet(id);
      window.mainStore.portfolioStore.detailedPositionReport.types[0].securitiesDetailed.push({ detailedPositions: [
        { tradingSymbol: 'NEXT DEMO FIX call 100', totalCurrentSize: 4, totalCollateralSize: 0 },
      ] });
    });
    await openSimulator(); await loadPosition(); await field('Prima histórica CALL 100', '8');
    const expiries = await label('Vencimiento de opciones').evaluate(e => [...e.options].map(o => o.value).filter(Boolean));
    equal(expiries.length, 2, 'Two fixture maturities');
    await b('Nueva simulación').click(); await label('Vencimiento de opciones').selectOption(expiries[1]);
    await b('Posición actual').click(); await value('Cantidad posición CALL 100', '+4'); await value('Prima histórica CALL 100', '');
    await field('Prima histórica CALL 100', '12');
    await b('Nueva simulación').click(); await label('Vencimiento de opciones').selectOption(expiries[0]); await b('Posición actual').click();
    await value('Prima histórica CALL 100', '8');
    pass('RG-06-chain', 'Distinct expirations do not inherit premiums; returning restores original chain cost');
  } else if (group === 'roll') {
    await openSimulator(); await loadPosition();
    await b('Rolar posición CALL 110').click(); await b('Rolar a 120').click(); await b('Usar mínimo sin débito').click();
    let dialog = page.getByRole('dialog');
    assert((await dialog.innerText()).includes('167,22 ARS'), 'Short roll net 167.22 with 0.2% fees');
    await field('Gastos del rolado (%)', '1'); assert((await dialog.innerText()).includes('156,1 ARS'), 'Short roll net 156.10 with 1% fees');
    await b('Cargar en Cotizaciones →').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+1', '−2'], 'Short roll closing and opening quantities');
    for (const name of ['Comprar DEMO CALL 110 en simulación', 'Vender DEMO CALL 120 en simulación'])
      equal(await b(name).getAttribute('draggable'), 'false', 'Roll legs are not draggable');
    assert(await label('Incluir posición actual en Análisis').isChecked(), 'Roll includes current position');
    await b('Limpiar ajustes').click(); await b('Posición actual').click();
    await b('Rolar posición CALL 100').click(); await b('Rolar a 110').click(); await b('Usar máximo sin débito').click();
    assert((await dialog.innerText()).includes('354,4 ARS'), 'Long roll net 354.40');
    await b('Cargar en Cotizaciones →').click();
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['−2', '+2'], 'Long roll closing and opening quantities');
    await b('Limpiar ajustes').click(); await b('Posición actual').click();
    await page.evaluate(() => { const c = window.mainStore.securityStore.options.find(c => c.id === 'call-120'); c.md.bsz = 0; c.md.seq++; });
    await b('Rolar posición CALL 110').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Rolar a 120"]')?.disabled);
    assert(await b('Cargar en Cotizaciones →').isDisabled(), 'Missing liquidity blocks loading');
    await page.keyboard.press('Escape'); equal(await page.getByRole('dialog').count(), 0, 'Roll dialog Escape');
    pass('RG-07', 'Bought/sold rolls, min/max financing, fees 0.2/1%, two legs, unavailable liquidity and Escape');
  } else if (group === 'limits') {
    await openSimulator(); await b('Elegir estrategia').click();
    await page.locator('[data-family-name="butterfly"]').click();
    const preview = await label('Patas de la plantilla').innerText();
    for (const expected of ['Compra 1× DEMO CALL 90', 'Venta 2× DEMO CALL 100', 'Compra 1× DEMO CALL 110']) assert(preview.includes(expected), 'Butterfly preview ' + expected);
    await page.locator('[data-family-name="butterfly"]').locator('..').locator('.ct-sim-strategy-apply').click();
    equal(await page.locator('.ct-sim-leg-strike').allTextContents(), ['90', '100', '110'], 'Preview/build strikes');
    equal(await page.locator('.ct-sim-quantity-stepper .ct-sim-cell-value').allTextContents(), ['+1', '−2', '+1'], 'Preview/build proportions');
    assert(await b('Bajar cantidades de toda la estrategia').isDisabled(), 'Ratio floor cannot go below one');
    await b('Limpiar patas').click(); await selectCall();
    assert(await b('Reducir contratos pata 1').isDisabled(), 'Leg cannot cross zero');
    await edit('Contratos pata 1', '10000000000');
    assert(await b('Aumentar contratos pata 1').isDisabled(), 'Upper quantity limit');
    await edit('Contratos pata 1', '1');
    for (let i = 0; i < 3; i++) await b('Subir strikes de toda la estrategia').click();
    assert(await b('Subir strikes de toda la estrategia').isDisabled(), 'Outer upper strike boundary');
    for (let i = 0; i < 6; i++) await b('Bajar strikes de toda la estrategia').click();
    assert(await b('Bajar strikes de toda la estrategia').isDisabled(), 'Outer lower strike boundary');
    pass('RG-02-limits', 'Preview/build correspondence, quantity floor/ceiling, upper/lower chain boundaries');
  } else if (group === 'reader-errors') {
    await open(); await b('Operaciones de opciones').click(); await b('Copiar Calls y Puts').waitFor();
    await page.evaluate(() => { window.mainStore.profileStore.activeAccount = 'DEMO-SECOND'; });
    await page.getByRole('alert').filter({ hasText: 'Cambió la cuenta' }).waitFor();
    equal(await b('Copiar Calls y Puts').count(), 0, 'Stale account executions removed');
    await page.evaluate(() => { window.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => []; });
    await b('Actualizar desde Matriz').click(); await page.getByText('No hay ejecuciones de opciones disponibles en el reporte de Matriz.', { exact: true }).waitFor();
    await page.evaluate(() => { window.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => { throw Error('synthetic-private-marker'); }; });
    await b('Actualizar desde Matriz').click(); await page.getByRole('alert').filter({ hasText: 'No se pudo leer' }).waitFor();
    assert(!(await page.getByRole('alert').innerText()).includes('synthetic-private-marker'), 'Reader sanitizes errors');
    await b('Simulador de opciones').click();
    await page.evaluate(() => { window.mainStore.portfolioStore.getDetailedPositionReport = async () => { throw Error('synthetic-private-marker'); }; });
    await b('Posición actual').click(); await page.getByText('No se pudo actualizar la posición de Matriz. Revisá la conexión y volvé a intentar.', { exact: true }).waitFor();
    await page.evaluate(() => { const report = window.mainStore.portfolioStore.detailedPositionReport; report.types = []; window.mainStore.portfolioStore.getDetailedPositionReport = async () => report; });
    await reloadPosition(); await page.getByText('No hay posición abierta en esta cadena. Podés ingresar una posición manual.', { exact: true }).waitFor();
    pass('SM-08/SM-09-errors', 'Empty/error readers and stale-account clearing, sanitized failures and recovery');
  } else if (group === 'layout') {
    await openSimulator(); await selectCall();
    for (const width of [1024, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => document.querySelector('.ct-opt-chain-grid')?.clientWidth > 0);
      const layout = await page.locator('.ct-opt-chain-grid').evaluate(grid => {
        const width = grid.getBoundingClientRect().width;
        return { table: grid.querySelector('table').getBoundingClientRect().width, width,
          overlays: [...grid.querySelectorAll('.ct-opt-sigma-line')].map(e => e.getBoundingClientRect().width),
          pageOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(Math.abs(layout.table - layout.width) < 2, `Aligned grid at ${width}`);
      assert(layout.overlays.every(w => Math.abs(w - layout.width) < 2), `Aligned sigma at ${width}`);
      assert(!layout.pageOverflow, `No page overflow at ${width}`);
      await page.getByRole('region', { name: 'Cadena de opciones', exact: true }).evaluate(e => { e.scrollLeft = e.scrollWidth; e.scrollTop = e.scrollHeight; });
      await b('Configurar cadena de opciones').click(); await b('Listo').click();
    }
    const tab = page.getByRole('tab', { name: 'Armado', exact: true }); await tab.focus(); await page.keyboard.press('ArrowRight');
    equal(await page.getByRole('tab', { name: 'Análisis', exact: true }).getAttribute('aria-selected'), 'true', 'Keyboard switches analysis tab');
    await page.keyboard.press('ArrowLeft');
    await b('Elegir estrategia').click(); await page.keyboard.press('Escape');
    equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Elegir estrategia', 'Selector restores focus');
    pass('RG-10', '1024/1920 grid/overlay alignment, scroll, controls, keyboard tabs and Escape focus');
  } else {
    throw Error(`Unimplemented group ${group}`);
  }
  return { cases };
}
