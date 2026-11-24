const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const assert = require('node:assert/strict');

const script = readFileSync(join(__dirname, '../state-sync.js'), 'utf8');
const merge = vm.runInNewContext(script + '\nHouseholdState.merge;', {structuredClone});
const state = () => ({
  week: '2026-11-23', menu: [], checked: {}, prefs: {season: 'auto'},
  pantry: {}, favorites: [], custom: [], history: [], manual: []
});

test('combines independent purchases without sharing mutable objects with the baseline', () => {
  const base = state();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.checked['papas|g'] = true;
  remote.checked['pan|g'] = true;
  const result = merge(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.state.checked, {'papas|g': true, 'pan|g': true});

  result.state.prefs.season = 'invierno';
  assert.equal(remote.prefs.season, 'auto');
  assert.equal(base.prefs.season, 'auto');
  const followup = merge(remote, result.state, remote);
  assert.equal(followup.state.prefs.season, 'invierno');
});

test('asks for a choice when both people edit a preference and preserves independent changes', () => {
  const base = state();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.prefs.season = 'otoño';
  remote.prefs.season = 'primavera';
  remote.pantry['papas|g'] = 100;
  assert.equal(merge(base, local, remote).conflicts.join(), 'Preferencias');
  const chosen = merge(base, local, remote, 'local').state;
  assert.equal(chosen.prefs.season, 'otoño');
  assert.equal(chosen.pantry['papas|g'], 100);
});

test('keeps weekly transitions together and detects a conflicted recipe replacement', () => {
  const base = state();
  base.menu = [{id: 'r001', people: 2}];
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.menu[0].people = 4;
  remote.menu[0].id = 'r002';
  assert.equal(merge(base, local, remote).conflicts.join(), 'Menú semanal');
  remote.week = '2026-11-30';
  assert.equal(merge(base, local, remote).conflicts.join(), 'Menú semanal');
  const chosen = merge(base, local, remote, 'remote').state;
  assert.equal(chosen.menu[0].id, 'r002');
  assert.equal(chosen.week, '2026-11-30');
});
