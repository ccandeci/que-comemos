'use strict';

const HouseholdState = (() => {
  const equal = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const fieldNames = {
    menu: 'Menú semanal', history: 'Historial', favorites: 'Favoritos',
    excluded: 'Recetas excluidas', custom: 'Recetas propias', pantry: 'Despensa',
    checked: 'Compras', manual: 'Productos agregados', ratings: 'Calificaciones',
    prefs: 'Preferencias'
  };
  const collections = {
    history: x => x.week, favorites: x => x, excluded: x => x,
    custom: x => x.id, manual: x => x.id, rapid: x => x
  };

  function merge(base, local, remote, prefer = 'remote') {
    const conflicts = new Set();
    const choose = (path, a, b) => {
      conflicts.add(fieldNames[path[0]] || 'Menú semanal');
      return prefer === 'local' ? a : b;
    };
    function visit(original, a, b, path) {
      if (equal(a, original)) return b;
      if (equal(b, original) || equal(a, b)) return a;
      const field = path.at(-1);
      if (field === 'menu' && Array.isArray(a) && Array.isArray(b)) {
        return Array.from({length: 10}, (_, i) => visit(original?.[i] ?? null, a[i] ?? null, b[i] ?? null, [...path, i]));
      }
      if (path[0] === 'menu' && path.length === 2 &&
          (a?.id !== b?.id || original?.id !== a?.id)) return choose(path, a, b);
      if (Object.hasOwn(collections, field) && Array.isArray(a) && Array.isArray(b)) {
        const asRecord = values => Object.fromEntries((values || []).map(x => [collections[field](x), x]));
        const entries = mergeRecord(asRecord(original), asRecord(a), asRecord(b), path);
        const values = Object.values(entries);
        return field === 'history' ? values.sort((x, y) => y.week.localeCompare(x.week)).slice(0, 52) : values;
      }
      if (record(a) && record(b) && (record(original) || original === undefined)) {
        return mergeRecord(original || {}, a, b, path);
      }
      return choose(path, a, b);
    }
    function mergeRecord(original, a, b, path) {
      return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => {
        const read = object => Object.hasOwn(object, k) ? object[k] : undefined;
        const value = visit(read(original), read(a), read(b), [...path, k]);
        return value === undefined ? [] : [[k, value]];
      }));
    }

    // A change of week moves the menu and its purchased flags together.
    const weekFields = state => ({week: state.week, menu: state.menu, checked: state.checked});
    const otherFields = ({week, menu, checked, ...other}) => other;
    let calendar;
    if (local.week !== base.week || remote.week !== base.week) {
      const original = weekFields(base), a = weekFields(local), b = weekFields(remote);
      calendar = equal(a, original) ? b : equal(b, original) || equal(a, b) ? a : choose(['menu'], a, b);
    } else {
      calendar = mergeRecord(weekFields(base), weekFields(local), weekFields(remote), []);
      const meals = calendar.menu.filter(Boolean);
      if (new Set(meals.map(m => m.id)).size !== meals.length || meals.filter(m => m.world).length > 1) {
        calendar.menu = choose(['menu'], local.menu, remote.menu);
      }
    }
    return {state: {...mergeRecord(otherFields(base), otherFields(local), otherFields(remote), []), ...calendar}, conflicts: [...conflicts]};
  }

  return {equal, merge};
})();
