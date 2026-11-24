// Offline browser integration fixture. Never packaged with the extension.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFree, filesIn } from '../scripts/check-free.mjs';
checkFree({ built: true });
const dist = new URL('../dist/', import.meta.url), files = filesIn(fileURLToPath(dist));
const main = files.find(p => /^assets\/src-main\.tsx-[\w-]+\.js$/.test(p));
const styles = JSON.parse(readFileSync(new URL('manifest.json', dist), 'utf8')).content_scripts[0].css.map(p => `<link rel="stylesheet" href="/${p}">`).join('');
function install() {
  const listeners = new Set(), readStorage = () => JSON.parse(localStorage.getItem('ct-ratios-fixture-settings') || '{}');
  window.chrome = { runtime: { getURL: path => '/' + path }, storage: { local: {
    get: async key => { const data = readStorage(); return typeof key === 'string' ? { [key]: data[key] } : data; },
    set: async value => { localStorage.setItem('ct-ratios-fixture-settings', JSON.stringify({ ...readStorage(), ...value })); listeners.forEach(fn => fn(Object.fromEntries(Object.entries(value).map(([key, newValue]) => [key, { newValue }])), 'local')); },
  }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
  const clone = x => JSON.parse(JSON.stringify(x));
  let counter = 0;
  const securities = [
    ['BMA', 12000, 10000, 'ARS', '2'], ['GGAL', 11000, 10000, 'ARS', '2'], ['ALUA', 776, 780, 'ARS', '2'], ['TXAR', 724, 732, 'ARS', '2'],
    ['AL30', 70000, 69000, 'ARS', '2'], ['AL30D', 50, 50, 'USD', '2'], ['AL30C', 51, 50, 'EXT', '2'], ['AL30', 71000, 69000, 'ARS', '1'],
    ['GD30', 72000, 71000, 'ARS', '2'], ['PESOS - 7D', 40, 39, 'ARS', ''], ['PESOS - 1D', 35, 34, 'ARS', '']
  ].map(([symbolStr, lst, refp, currency, settlementType]) => ({ id: symbolStr + '-' + settlementType, symbol: settlementType === '1' ? symbolStr + ' CI' : symbolStr, symbolStr: settlementType === '1' ? symbolStr + ' CI' : symbolStr, marketId: 'bm', currency, settlementType, md: { lst, refp, seq: 1, lstdStr: new Date().toISOString() } }));
  securities.push({ id: 'rx_DDF_DLR_SPOT', symbol: 'DLR/SPOT', symbolStr: 'DLR/SPOT', marketId: 'rx', currency: 'ARS', settlementType: null, cfiCode: 'MRIXXX', md: { lst: 1572.5, refp: 1565, seq: 1, lstdStr: new Date().toISOString(), refdStr: '2026-11-19' } });
  for (const [month, lst] of [['NOV26', 1600], ['DIC26', 1650]]) securities.push({ id: 'rx_DDF_DLR_' + month,
    symbol: 'DLR/' + month, symbolStr: 'DLR/' + month, marketId: 'rx', currency: 'ARS', settlementType: null, cfiCode: 'FXXXSX',
    refData: { totalAmountFactor: 1, contractMultiplier: 1000, roundLot: 1 }, md: { lst, refp: 1590, seq: 1, lstdStr: new Date().toISOString() } });
  let ds;
  function nativeWidget(data, dashboard) {
    return { ...data, dashboard, key: data.component + '-' + (++counter),
      cols() { return this.w / 5; }, rows() { return this.h / 25; },
      calculateWidth(w) { return w * 5; }, calculateHeight(h) { return h * 25; } };
  }
  const clean = d => ({ id: d.id, name: d.name, layout: d.layout.map(({ component, x, y, w, h, settings, selectionCriteria }) => clone({ component, x, y, w, h, settings, selectionCriteria })) });
  const render = () => {
    const grid = document.querySelector('.GridLayout'), d = ds.currentDashboard;
    const wanted = new Set(d.layout.map(w => w.key));
    for (const slot of grid.children) if (!wanted.has(slot.dataset.key)) slot.remove();
    for (const w of d.layout) {
      let slot = [...grid.children].find(e => e.dataset.key === w.key);
      if (!slot) { slot = document.createElement('div'); slot.dataset.key = w.key; slot.className = 'DashboardGridItem DashboardGridItem-' + w.key; grid.append(slot); }
      Object.assign(slot.style, { position: 'absolute', left: w.x * 5 + 'px', top: w.y * 25 + 'px', width: w.w + 'px', height: w.h + 'px' });
      if (w.component === 'NativeControl' && !slot.firstChild) { const label = document.createElement('div'); label.textContent = 'Widget nativo de control'; label.style.border = '1px solid gray'; slot.append(label); }
    }
  };
  function hydrate(data) {
    let layout;
    const d = { id: data.id, name: data.name, width: 1600, cols: 320, rowHeight: 25, widgetsDicts: new Map(),
      get layout() { return layout; }, set layout(value) { layout = value; if (ds?.currentDashboard === this) render(); },
      onSave() { localStorage.setItem('ct-ratios-fixture-' + this.id, JSON.stringify(clean(this))); },
      addWidget(w) { this.widgetsDicts.set(w.key, w); this.layout = [...this.layout, w]; this.onSave(); },
      updateLayout(next) { for (const n of next) { const w = this.widgetsDicts.get(n.i); w.x = n.x; w.y = n.y; w.w = Math.ceil(n.w * 5); w.h = Math.ceil(n.h * 25); } render(); this.onSave(); }
    };
    layout = data.layout.map(w => nativeWidget(w, d)); layout.forEach(w => d.widgetsDicts.set(w.key, w)); return d;
  }
  const initial = id => ({ id, name: id, layout: [{ component: 'NativeControl', x: 0, y: 0, w: 400, h: 80, settings: { control: true }, selectionCriteria: { securities: [] } }] });
  const d = hydrate(JSON.parse(localStorage.getItem('ct-ratios-fixture-main') || 'null') || initial('main'));
  const alternate = hydrate(JSON.parse(localStorage.getItem('ct-ratios-fixture-alternate') || 'null') || initial('alternate'));
  ds = { currentDashboard: d, dashboards: [d, alternate], widgetsLimit: 20,
    createDashboard: hydrate,
    async getDashboard(id) { return hydrate(JSON.parse(localStorage.getItem('ct-ratios-fixture-' + id))); }
  };
  window.mainStore = { dashboardStore: ds, securityStore: { securities, getSecurity: async id => securities.find(s => s.id === id) },
    profileStore: { activeAccount: 'SYNTHETIC' }, webSocketConnectionStatus: true, dmaWebSocket: { addSubscription() {} } };
  window.ratiosFixture = {
    price(id, value) { const s = securities.find(s => s.id === id); s.md.lst = value; s.md.seq++; },
    connected(value) { window.mainStore.webSocketConnectionStatus = value; },
    switchDashboard() { ds.currentDashboard = ds.currentDashboard === d ? alternate : d; render(); }
  };
  render();
}
// Exercises the production content bootstrap and chart reader without a broker.
function installChart() {
  const id = decodeURIComponent(location.pathname.slice('/security/'.length));
  const instrument = window.mainStore.securityStore.securities.find(s => s.id === id);
  let sequence = 0, resolution = 'D', chartType = 2;
  const studies = new Map();
  const scale = () => { let mode = 2; return { getMode: () => mode, setMode(value) { mode = value; }, setAutoScale() {} }; };
  const mainScale = scale();
  const chart = {
    symbol: () => instrument.symbol, resolution: () => resolution, chartType: () => chartType,
    async setResolution(value) { resolution = value; }, setChartType(value) { chartType = value; },
    getSeries: () => ({ priceScale: () => mainScale, changePriceScale() {} }),
    getAllStudies: () => [...studies].map(([id, s]) => ({ id, name: s.name })),
    getStudyById(id) { const s = studies.get(id); return {
      getInputValues: () => Object.entries(s.inputs).map(([id, value]) => ({ id, value })),
      priceScale: () => s.scale, changePriceScale(value) { s.options = { priceScale: value }; },
      setVisible(value) { s.visible = value; },
      paneIndex: () => s.name === 'Overlay' ? 0 : 1,
    }; },
    async createStudy(name, overlay, lock, inputs, overrides, options) {
      const id = String(++sequence); studies.set(id, { name, inputs, options, scale: scale() }); return id;
    },
    removeEntity(id) { studies.delete(id); },
  };
  document.getElementById('tv_chart_container').__reactFiberFixture = { stateNode: { props: { security: { id } }, widget: { activeChart: () => chart, getStudiesList: () => ['Ratio', 'Overlay'] } } };
  window.ratioChartFixture = { chart, snapshot: () => ({ symbol: chart.symbol(), resolution, chartType, mainMode: mainScale.getMode(),
    studies: [...studies.values()].map(s => ({ name: s.name, inputs: s.inputs, options: s.options, scaleMode: s.scale.getMode() })) }) };
}
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
  if (path === 'fixture' || path.startsWith('security/')) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Ratios · DATOS SIMULADOS</title>${styles}<body style="background:#222c3b;color:white;font:14px Arial"><h1>Ratios · DATOS SIMULADOS · Sin conexión a broker</h1><p>Versión: 4.24.4</p><nav class="DirectAccessBar"></nav><div id="tv_chart_container"></div><div class="CustomDashboard"><div class="WidgetsComponentsPopoverList"></div><div class="GridLayout" style="position:relative;height:1200px"></div></div><script>(${install.toString()})();${path.startsWith('security/') ? `(${installChart.toString()})();` : ''}</script><script type="module" src="/${main}"></script></body></html>`); return;
  }
  if (!files.includes(path)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  response.end(readFileSync(new URL(path, dist)));
});
server.listen(0, '127.0.0.1', () => console.log('Ratios fixture: http://127.0.0.1:' + server.address().port + '/fixture'));
