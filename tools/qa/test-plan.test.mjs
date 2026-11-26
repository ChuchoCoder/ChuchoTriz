import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { testPlan } from './test-plan.mjs';
import { fixtureTheme } from './themes.mjs';

test('smoke and regression schedule every UI group once in each theme', () => {
  for (const mode of ['smoke', 'regression']) {
    const plan = testPlan(mode);
    const groups = theme => plan.filter(suite => suite.theme === theme).map(suite => suite.group);
    assert.deepEqual(groups('dark'), groups('light'));
    assert.equal(new Set(plan.map(suite => suite.id)).size, plan.length);
    assert.ok(groups('dark').includes('theme-controls'));
    assert.ok(groups('light').includes('theme-widgets'));
  }
  assert.ok(testPlan('regression').some(suite => suite.group === 'ratio-chart' && suite.fixture === 'ratios'));
});

test('a selected group still runs in both themes and rejects unknown groups', () => {
  assert.deepEqual(testPlan('regression', 'presets').map(suite => suite.id), ['dark/presets', 'light/presets']);
  assert.throws(() => testPlan('regression', 'typo'), /Unknown group/);
});

test('group names are passed only to suites that dispatch multiple groups', () => {
  for (const suite of testPlan('regression', 'mini-layout')) assert.equal(suite.groupArgument, 'mini-layout');
  for (const suite of testPlan('regression', 'theme-controls')) assert.equal(suite.groupArgument, 'theme-controls');
  for (const suite of testPlan('regression', 'intraday')) assert.equal(suite.groupArgument, undefined);
});

test('every loopback Playwright validator is registered in the regression', () => {
  const registered = new Set(testPlan('regression').map(suite => suite.file));
  for (const file of readdirSync(new URL('../', import.meta.url)).filter(name => /^validate-.+\.playwright\.js$/.test(name))) {
    assert.ok(registered.has(file), `Register ${file} in test-plan.mjs so it runs in both themes`);
  }
});

test('fixtures expose the Matriz theme and native color scheme', () => {
  assert.equal(fixtureTheme('light').attribute, 'dma_day');
  assert.equal(fixtureTheme('dark').attribute, 'dma_night');
  assert.match(fixtureTheme('light').style, /color-scheme: light/);
  assert.match(fixtureTheme('dark').style, /color-scheme: dark/);
  assert.notEqual(fixtureTheme('light').style, fixtureTheme('dark').style);
  assert.throws(() => fixtureTheme('unknown'), /Unknown fixture theme/);
});
