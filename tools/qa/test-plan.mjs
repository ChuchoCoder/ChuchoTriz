import { themes } from './themes.mjs';

const smoke = ['opening', 'presets', 'autocomplete', 'mini-layout', 'quotes', 'columns', 'tooltip',
  'preload', 'position', 'operations', 'analysis'];
const regression = ['oracle', 'editing', 'accounting', 'scope', 'roll', 'limits', 'reader-errors', 'layout'];
const extra = [
  { group: 'theme-controls', file: 'qa/browser-theme-cases.js', fixture: 'preview' },
  { group: 'theme-widgets', file: 'qa/browser-theme-cases.js', fixture: 'ratios' },
];
const dedicated = [
  { group: 'options-grid', file: 'validate-options-grid.playwright.js', fixture: 'preview' },
  { group: 'ratio-operations', file: 'validate-ratio-operations.playwright.js', fixture: 'preview' },
  { group: 'ratios-widget', file: 'validate-ratios-widget.playwright.js', fixture: 'ratios', mcpTimeoutMs: 300000 },
  { group: 'ratio-chart', file: 'validate-ratio-chart.playwright.js', fixture: 'ratios' },
  { group: 'ratio-futures', file: 'validate-ratio-futures.playwright.js', fixture: 'ratios' },
  { group: 'intraday', file: 'validate-intraday.playwright.js', fixture: 'ratios' },
];
const baseline = { group: 'baseline', file: 'validate-options-simulator.playwright.js', fixture: 'preview', expectedChecks: 34 };

export function testPlan(mode, selected) {
  if (mode !== 'smoke' && mode !== 'regression') throw Error(`Unknown browser QA mode ${mode}`);
  const builtIn = [...smoke, ...(mode === 'regression' ? regression : [])]
    .map(group => ({ group, file: 'qa/browser-cases.js', fixture: 'preview' }));
  // Only the grouped suites take a group name. Standalone validators own their optional arguments.
  const grouped = [...builtIn, ...extra].map(suite => ({ ...suite, groupArgument: suite.group }));
  const suites = mode === 'smoke' ? grouped : [baseline, ...grouped, ...dedicated];
  if (selected && !suites.some(suite => suite.group === selected)) throw Error(`Unknown group: ${selected}`);
  return themes.flatMap(theme => suites.filter(suite => !selected || suite.group === selected)
    .map(suite => ({ ...suite, theme, id: `${theme}/${suite.group}` })));
}
