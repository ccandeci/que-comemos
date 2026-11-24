'use strict';

const ProjectAccount = (() => {
  const project = 'https://tvfoihbgdcsrtxswvnpj.supabase.co';
  const publishableKey = 'sb_publishable_-UXG4wE5lCQhVBoCTkUQew_59wGH3Jq';
  const itemKey = 'que-comemos/state-v1';
  const backupKey = 'que-comemos-v1';
  const inviteKey = 'que-comemos-invitation';
  const address = new URL(location.pathname, location.origin).href;
  const invite = new URLSearchParams(location.hash.slice(1)).get('invitacion');
  let token = /^[a-f0-9]{64}$/.test(invite || '') ? invite : null;
  try {
    if (token) {
      sessionStorage.setItem(inviteKey, token);
      history.replaceState(null, '', address);
    } else token = sessionStorage.getItem(inviteKey);
  } catch {}
  const client = window.supabase?.createClient(project, publishableKey);
  let session, home, guest, workspace, timer, inFlight = false, generation = 0;
  let accountMode = 'login', feedback = '', syncLabel = '', invitationURL = '', ready = false;
  const deferred = document.querySelector('#account-status');
  const accountDialog = document.querySelector('#account');
  const status = value => {
    syncLabel = value;
    deferred.textContent = value;
  };

  function readDraft() {
    try { return JSON.parse(localStorage.getItem(workspace)) || null; }
    catch { return null; }
  }

  function writeDraft(draft) {
    try {
      localStorage.setItem(workspace, JSON.stringify(draft));
      return true;
    } catch {
      status('Sin espacio para guardar en este dispositivo. Exportá una copia.');
      return false;
    }
  }

  let base, revision = 0, blocked, initialized = false, scope, releaseEditor;
  function pending() {
    return initialized && !HouseholdState.equal(base, S);
  }

  function paint() {
    document.querySelector('#account-button').textContent = session ? home ? 'Mi hogar' : 'Mi cuenta' : 'Ingresar / Crear cuenta';
    if (!accountDialog.open) return;
    const oldEmail = accountDialog.querySelector('[name=email]')?.value || '';
    const notice = feedback ? `<p role="status" class="notice">${esc(feedback)}</p>` : '';
    let content;
    if (!client) {
      content = '<p>No se pudo cargar el servicio de cuentas. Podés seguir usando el modo local.</p>';
    } else if (!ready) {
      content = '<p>Cargando cuenta…</p>';
    } else if (!session) {
      const signup = accountMode === 'signup';
      content = `<h2>${signup ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
        ${token ? '<p>Ingresá con el correo al que enviaron la invitación.</p>' : ''}
        ${notice}
        <form data-account-form="${signup ? 'signup' : 'login'}">
          <label class="field">Correo electrónico<input name="email" type="email" autocomplete="email" required value="${esc(oldEmail)}"></label>
          <label class="field">Contraseña<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required></label>
          <button type="submit" class="primary">${signup ? 'Registrarme' : 'Ingresar'}</button>
          <button type="button" data-account-act="toggle">${signup ? 'Ya tengo cuenta' : 'Crear cuenta'}</button>
        </form>`;
    } else {
      content = `<h2>${home ? 'Mi hogar' : 'Mi cuenta'}</h2><p class="muted">${esc(session.user.email)}</p>${notice}
        ${home ? `<p>${home.partner_id ? 'Hogar compartido con tu pareja.' : 'Tu hogar privado está listo.'}</p>
          ${home.owner_id === session.user.id && !home.partner_id ? `<form data-account-form="invite">
            <label class="field">Correo de tu pareja<input name="email" required type="email" value="${esc(oldEmail)}"></label>
            <button type="submit" class="primary">Generar invitación</button>
          </form><p class="muted">Compartí el enlace solo con tu pareja. Vence en 48 horas y se usa una sola vez.</p>` : ''}
          ${invitationURL ? `<label class="field">Enlace de invitación<input readonly value="${esc(invitationURL)}"></label>
            <button data-account-act="copy">Copiar enlace</button>` : ''}
          ${blocked ? '<p>Ambos editaron los mismos datos. Cerrá este cuadro y elegí una versión en el aviso.</p>' : ''}`
        : `<p>${token ? 'Al aceptar, vas a abrir el menú del hogar. Los datos del modo local siguen disponibles por separado.' : 'Creá un hogar para compartir los datos del modo local.'}</p>
          ${token ? '<button class="primary" data-account-act="join">Aceptar invitación</button>' : '<button class="primary" data-account-act="create">Crear hogar</button>'}
          <form data-account-form="join"><label class="field">Enlace o código de invitación<input name="token" required></label>
            <button type="submit">Vincularme a un hogar</button></form>`}
        <p><button data-account-act="logout">Cerrar sesión</button>
        ${home ? '<button data-account-act="backup">Exportar datos del modo local</button>' : ''}</p>`;
    }
    accountDialog.innerHTML = `<button data-account-act="close" class="close" aria-label="Cerrar">×</button>${content}`;
  }

  function paintConflict() {
    document.querySelector('#sync-conflict').hidden = !blocked;
    document.querySelector('#sync-conflict-text').textContent = blocked
      ? `Ambos editaron los mismos datos (${blocked.fields.join(', ')}). Elegí qué versión conservar para esos cambios. El resto se combina.` : '';
  }

  function renderShared() {
    // Polling must not replace a focused input or erase an unsaved dialog form.
    const active = document.activeElement;
    if (!document.querySelector('#detail').open &&
        !active?.matches('#app input, #app textarea, #app select')) render();
    else document.querySelector('#app').addEventListener('focusout', () => setTimeout(() => {
      if (!document.activeElement?.matches('#app input, #app textarea, #app select')) render();
    }), {once: true});
  }

  async function rpc(fn, args) {
    const {data, error} = await client.rpc(fn, args);
    if (error) throw error;
    return data;
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = scope ? setTimeout(() => { timer = null; sync(); }, ms) : null;
  }

  async function sync() {
    if (inFlight || !scope || scope.waiting) return;
    const current = scope;
    inFlight = true;
    try {
      const {data, error} = await client.from('household_items').select('payload,revision')
        .eq('household_id', current.home.id).eq('item_key', itemKey).maybeSingle();
      if (current !== scope) return;
      if (error) throw error;
      const remote = data?.payload ? restoreState(data.payload) : fresh();
      const version = data?.revision ?? 0;
      if (!initialized) {
        if (!data && current.home.owner_id === session.user.id) {
          S = structuredClone(guest);
        } else S = structuredClone(remote);
        base = remote;
        revision = version;
        initialized = true;
        writeDraft({base, revision, state: S});
        renderShared();
      } else if (version !== revision) {
        const merged = HouseholdState.merge(base, S, remote);
        if (merged.conflicts.length) {
          blocked = {fields: merged.conflicts, remote, version};
          paintConflict();
          status('Hay cambios simultáneos por revisar.');
          return;
        }
        blocked = null;
        paintConflict();
        base = remote;
        revision = version;
        S = merged.state;
        writeDraft({base, revision, state: S});
        renderShared();
      }
      if (pending()) {
        const outgoing = structuredClone(S);
        const next = await rpc('qc_save_state', {p_home: current.home.id, p_revision: revision, p_state: outgoing});
        if (current !== scope) return;
        if (next === null) {
          schedule(50);
          return;
        }
        base = outgoing;
        revision = next;
        writeDraft({base, revision, state: S});
      }
      status(pending() ? 'Guardando cambios…' : 'Hogar sincronizado');
    } catch (error) {
      if (current === scope) status(`Sin sincronizar. ${error.message || 'Se reintentará cuando vuelva la conexión.'}`);
    } finally {
      inFlight = false;
      if (current !== scope) schedule(50);
      else if (!timer) schedule(pending() && !blocked && syncLabel === 'Guardando cambios…' ? 100 : 5000);
    }
  }

  function saveLocal() {
    if (!scope) return false;
    if (!initialized) return true;
    if (writeDraft({base, revision, state: S}) && !blocked && pending()) status('Cambios guardados en este dispositivo. Sincronizando…');
    schedule(120);
    return true;
  }

  async function activate(nextSession) {
    const identity = nextSession?.user.id || null;
    if (ready && identity === (session?.user.id || null) && nextSession) {
      session = nextSession;
      return;
    }
    const epoch = ++generation;
    ready = true;
    if (scope && pending()) writeDraft({base, revision, state: S});
    clearTimeout(timer);
    timer = null;
    scope = null;
    releaseEditor?.();
    releaseEditor = null;
    initialized = false;
    blocked = null;
    paintConflict();
    invitationURL = '';
    if (guest) {
      try { guest = restoreState(JSON.parse(localStorage.getItem(backupKey)) || guest); } catch {}
      S = structuredClone(guest);
    }
    session = nextSession;
    home = null;
    status(session ? 'Buscando tu hogar…' : 'Modo local');
    paint();
    renderShared();
    if (!session) return;
    await openHome(epoch);
    if (epoch === generation && token) show();
  }

  function prepareEditor(current) {
    if (scope !== current) return;
    current.waiting = false;
    const draft = readDraft();
    if (draft) {
      base = restoreState(draft.base);
      revision = draft.revision;
      S = restoreState(draft.state);
      initialized = true;
    }
    renderShared();
    status('Conectando con tu hogar…');
    schedule(0);
  }

  function connect(data) {
    home = data;
    if (!home) {
      status('Modo local · sin hogar vinculado');
      return;
    }
    guest = structuredClone(S);
    workspace = `que-comemos-home:${session.user.id}:${home.id}`;
    const current = {home, waiting: Boolean(navigator.locks)};
    scope = current;
    initialized = false;
    S = fresh();
    if (!current.waiting) {
      prepareEditor(current);
      return;
    }
    status('Abriendo el hogar…');
    renderShared();
    navigator.locks.request(workspace, async () => {
      if (scope !== current) return;
      await new Promise(resolve => {
        releaseEditor = resolve;
        prepareEditor(current);
      });
    }).catch(() => {
      if (scope === current) prepareEditor(current);
    });
  }

  async function openHome(epoch = generation) {
    const membershipKey = `que-comemos-membership:${session.user.id}`;
    try {
      const {data, error} = await client.from('households').select('id,owner_id,partner_id').maybeSingle();
      if (epoch !== generation) return;
      if (error) throw error;
      try {
        if (data) localStorage.setItem(membershipKey, JSON.stringify(data));
        else localStorage.removeItem(membershipKey);
      } catch {}
      connect(data);
    } catch (error) {
      if (epoch !== generation) return;
      let cached;
      if (!navigator.onLine || /fetch|network/i.test(error.message || '')) {
        try { cached = JSON.parse(localStorage.getItem(membershipKey)); } catch {}
      }
      if (cached) connect(cached);
      else {
        status('No se pudo abrir el hogar.');
        feedback = error.message;
      }
    }
    paint();
  }

  function show() {
    if (!accountDialog.open) accountDialog.showModal();
    paint();
  }

  function close() {
    accountDialog.close();
    feedback = '';
  }

  function readable(error) {
    const translations = {
      invalid_credentials: 'Revisá el correo y la contraseña.',
      email_not_confirmed: 'Confirmá tu correo antes de ingresar.',
      email_address_invalid: 'Supabase no pudo usar ese correo para el registro.',
      email_address_not_authorized: 'El servicio de correo de Supabase aún no está habilitado para esa dirección.',
      over_email_send_rate_limit: 'Se alcanzó el límite de correos. Volvé a intentar más tarde.'
    };
    return translations[error.code] || error.message || 'No se pudo completar la operación. Volvé a intentar.';
  }

  async function perform(action, data = {}) {
    feedback = '';
    try {
      switch (action) {
        case 'login':
        case 'signup': {
          const credentials = {email: data.email, password: data.password};
          const result = action === 'signup'
            ? await client.auth.signUp({...credentials, options: {emailRedirectTo: address}})
            : await client.auth.signInWithPassword(credentials);
          if (result.error) throw result.error;
          if (!result.data.session) feedback = 'Revisá tu correo y confirmá tu cuenta antes de ingresar.';
          else if (!token) close();
          break;
        }
        case 'create':
          await rpc('qc_create_home');
          await openHome();
          close();
          break;
        case 'join': {
          const value = (data.token || token || '').trim();
          const parsed = value.match(/^(?:https?:\/\/[^#]+#invitacion=)?([a-f0-9]{64})$/);
          if (!parsed) throw Error('Pegá un enlace o un código de invitación válido.');
          await rpc('qc_join_home', {p_token: parsed[1]});
          token = null;
          try { sessionStorage.removeItem(inviteKey); } catch {}
          await openHome();
          close();
          break;
        }
        case 'invite': {
          const code = await rpc('qc_invite', {p_home: home.id, p_email: data.email});
          invitationURL = `${address}#invitacion=${code}`;
          feedback = 'La invitación está lista para compartir.';
          break;
        }
        case 'copy':
          await navigator.clipboard.writeText(invitationURL);
          feedback = 'Enlace copiado.';
          break;
        case 'backup':
          download('mis-menus-locales.json', guest);
          break;
        case 'logout': {
          if (pending() && !writeDraft({base, revision, state: S})) throw Error('Exportá una copia antes de cerrar sesión.');
          const {error} = await client.auth.signOut({scope: 'local'});
          if (error) throw error;
          close();
          break;
        }
      }
    } catch (error) {
      feedback = readable(error);
    }
    paint();
  }

  document.querySelector('#account-button').addEventListener('click', show);
  document.querySelector('#detail').addEventListener('close', () => { if (initialized) renderShared(); });
  accountDialog.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try { await perform(event.target.dataset.accountForm, Object.fromEntries(new FormData(event.target))); }
    finally { if (button) button.disabled = false; }
  });
  accountDialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-account-act]');
    if (!button) return;
    const action = button.dataset.accountAct;
    if (action === 'close') return close();
    if (action === 'toggle') {
      accountMode = accountMode === 'login' ? 'signup' : 'login';
      feedback = '';
      return paint();
    }
    button.disabled = true;
    try { await perform(action); }
    finally { button.disabled = false; }
  });

  document.querySelector('#sync-conflict').addEventListener('click', event => {
    const choice = event.target.dataset.conflict;
    if (!choice || !blocked) return;
    if (choice === 'backup') return download('mis-cambios.json', S);
    S = HouseholdState.merge(base, S, blocked.remote, choice).state;
    base = blocked.remote;
    revision = blocked.version;
    blocked = null;
    paintConflict();
    saveLocal();
    render();
  });
  window.addEventListener('online', () => {
    if (scope) schedule(0);
    else if (session && syncLabel === 'No se pudo abrir el hogar.') openHome();
  });
  window.addEventListener('focus', () => schedule(0));
  window.addEventListener('beforeunload', () => {
    if (scope && pending()) writeDraft({base, revision, state: S});
  });

  return {
    saveLocal,
    canEdit: () => !scope || initialized,
    loadingMessage: () => scope?.waiting
      ? 'Si el hogar está abierto en otra pestaña de este navegador, cerrala para editar acá.'
      : 'Cargando los datos del hogar…',
    start() {
      guest = structuredClone(S);
      if (!client) {
        status('Modo local');
        return;
      }
      client.auth.onAuthStateChange((_event, next) => setTimeout(() => activate(next), 0));
      if (token) show();
    }
  };
})();
