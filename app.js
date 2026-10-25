/* app.js — Interfaz y lógica de Bitácora Dev.
 * Depende de db.js (window.BitacoraDB). Sin librerías externas. */
(function () {
  'use strict';

  const DB = window.BitacoraDB;
  const $ = function (id) { return document.getElementById(id); };

  const ui = {
    app: $('app'),
    dbError: $('db-error'),
    dbErrorText: $('db-error-text'),
    btnInstall: $('btn-install'),
    menu: $('menu'),
    btnExport: $('btn-export'),
    btnImport: $('btn-import'),
    btnUpdate: $('btn-update'),
    importFile: $('import-file'),
    todayLabel: $('today-label'),
    entryCount: $('entry-count'),
    connStatus: $('conn-status'),
    notice: $('local-notice'),
    noticeExport: $('notice-export'),
    noticeClose: $('notice-close'),
    toast: $('toast'),
    fab: $('fab-new'),

    viewList: $('view-list'),
    viewDetail: $('view-detail'),
    viewEditor: $('view-editor'),

    toolbar: document.querySelector('.toolbar'),
    search: $('search'),
    filterType: $('filter-type'),
    filterProject: $('filter-project'),
    btnClearFilters: $('btn-clear-filters'),
    resultsInfo: $('results-info'),
    entryList: $('entry-list'),
    emptyState: $('empty-state'),
    emptyTitle: $('empty-title'),
    emptyText: $('empty-text'),
    emptyNew: $('empty-new'),

    detailBack: $('detail-back'),
    detailEdit: $('detail-edit'),
    detailDelete: $('detail-delete'),
    detailNumber: $('detail-number'),
    detailDate: $('detail-date'),
    detailTitle: $('detail-title'),
    detailType: $('detail-type'),
    detailProject: $('detail-project'),
    detailTags: $('detail-tags'),
    detailContent: $('detail-content'),
    detailCodeWrap: $('detail-code-wrap'),
    detailCode: $('detail-code'),
    detailCopy: $('detail-copy'),
    detailLinksWrap: $('detail-links-wrap'),
    detailLinks: $('detail-links'),
    detailCreated: $('detail-created'),
    detailUpdated: $('detail-updated'),

    form: $('entry-form'),
    editorBack: $('editor-back'),
    editorNumber: $('editor-number'),
    editorDelete: $('editor-delete'),
    saveStatus: $('save-status'),
    btnSave: $('btn-save'),
    fDate: $('f-date'),
    fTitle: $('f-title'),
    errTitle: $('err-title'),
    fType: $('f-type'),
    fProject: $('f-project'),
    projectOptions: $('project-options'),
    fTags: $('f-tags'),
    fContent: $('f-content'),
    fCode: $('f-code'),
    fLinks: $('f-links'),

    dialog: $('confirm-dialog'),
    confirmTitle: $('confirm-title'),
    confirmText: $('confirm-text'),
    confirmOk: $('confirm-ok')
  };

  const EMPTY_DEFAULT = {
    title: ui.emptyTitle.textContent,
    text: ui.emptyText.textContent
  };
  const NOTICE_KEY = 'bitacora-aviso-visto'; // solo una preferencia de interfaz, no un registro

  /* ---------- Estado ---------- */
  let entries = [];
  let numbers = new Map();           // id -> número de entrada (por orden de creación)
  const filters = { q: '', type: '', project: '' };
  let current = null;                // entrada abierta en el editor
  let currentPersisted = false;
  let detailId = null;
  let dirty = false;                 // hay cambios sin guardar en el editor
  let saveTimer = null;
  let saving = Promise.resolve();
  let toastTimer = null;
  let deferredInstall = null;
  const hayCache = new WeakMap();

  /* ---------- Utilidades ---------- */
  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function parseLocalDate(str) {
    const p = String(str || '').split('-');
    if (p.length !== 3) return null;
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateLong(str) {
    const d = parseLocalDate(str);
    if (!d) return str || '';
    return capitalize(d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  function formatDateShort(str) {
    const d = parseLocalDate(str);
    if (!d) return str || '';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function parseTags(str) {
    const seen = {};
    return String(str || '').split(',').map(function (t) { return t.trim(); }).filter(function (t) {
      const k = t.toLowerCase();
      if (!t || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /** Minúsculas y sin acentos, para buscar sin importar tildes. */
  function fold(s) {
    let out = '';
    for (const ch of String(s)) {
      out += ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    return out;
  }

  function byId(id) {
    for (let i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i];
    return null;
  }

  function toast(msg, ms) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, ms || 3200);
  }

  /** Convierte URLs http(s) en enlaces, sin usar innerHTML. */
  function linkify(container, text) {
    container.textContent = '';
    const re = /https?:\/\/[^\s<>"']+/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      let url = m[0];
      let trail = '';
      const t = url.match(/[.,;:!?)\]]+$/);
      if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = h('a', null, url);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      container.appendChild(a);
      if (trail) container.appendChild(document.createTextNode(trail));
      last = m.index + m[0].length;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }

  /** Devuelve un fragmento con las coincidencias de la búsqueda en <mark>. */
  function highlight(text, tokens) {
    const frag = document.createDocumentFragment();
    const f = tokens.length && text ? fold(text) : '';
    if (!f || f.length !== text.length) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    const ranges = [];
    tokens.forEach(function (t) {
      let i = f.indexOf(t);
      while (i !== -1) {
        ranges.push([i, i + t.length]);
        i = f.indexOf(t, i + t.length);
      }
    });
    if (!ranges.length) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    const merged = [ranges[0].slice()];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i].slice());
    }
    let pos = 0;
    merged.forEach(function (r) {
      if (r[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, r[0])));
      frag.appendChild(h('mark', null, text.slice(r[0], r[1])));
      pos = r[1];
    });
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  /** Fragmento de texto de la entrada, centrado en la primera coincidencia. */
  function excerptFor(e, tokens) {
    const source = (e.content && e.content.trim()) ? e.content : (e.codeSnippet || '');
    const clean = source.replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    let start = 0;
    if (tokens.length) {
      const f = fold(clean);
      if (f.length === clean.length) {
        const idx = f.indexOf(tokens[0]);
        if (idx > 100) start = idx - 40;
      }
    }
    const piece = clean.slice(start, start + 180);
    return (start > 0 ? '… ' : '') + piece + (start + 180 < clean.length ? ' …' : '');
  }

  /* ---------- Datos en memoria ---------- */
  function sortEntries() {
    entries.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }

  function recomputeNumbers() {
    const byCreation = entries.slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? -1 : (a.createdAt > b.createdAt ? 1 : 0);
    });
    numbers = new Map();
    byCreation.forEach(function (e, i) { numbers.set(e.id, i + 1); });
    ui.entryCount.textContent = entries.length + (entries.length === 1 ? ' entrada' : ' entradas');
  }

  function upsert(entry) {
    const i = entries.findIndex(function (e) { return e.id === entry.id; });
    if (i === -1) entries.push(entry); else entries[i] = entry;
    sortEntries();
    recomputeNumbers();
    renderFilterOptions();
  }

  async function reloadEntries() {
    entries = await DB.getAll();
    sortEntries();
    recomputeNumbers();
    renderFilterOptions();
  }

  /* ---------- Lista, búsqueda y filtros ---------- */
  function haystack(e) {
    let v = hayCache.get(e);
    if (v === undefined) {
      v = fold([e.title, e.content, e.project, e.tags, e.codeSnippet].join('\n'));
      hayCache.set(e, v);
    }
    return v;
  }

  function searchTokens() {
    return fold(filters.q).split(/\s+/).filter(Boolean);
  }

  function filtersActive() {
    return !!(filters.q.trim() || filters.type || filters.project);
  }

  function applyFilters(tokens) {
    return entries.filter(function (e) {
      if (filters.type && e.type !== filters.type) return false;
      if (filters.project && e.project !== filters.project) return false;
      if (!tokens.length) return true;
      const hay = haystack(e);
      return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
    });
  }

  function buildCard(e, tokens) {
    const li = h('li', 'entry-card');
    const btn = h('button', 'entry-link');
    btn.type = 'button';
    btn.dataset.id = e.id;

    btn.appendChild(h('div', 'entry-num', String(numbers.get(e.id) || '')));

    const body = h('div', 'entry-body');
    const top = h('div', 'entry-top');
    top.appendChild(h('span', null, formatDateShort(e.date)));
    if (e.project) top.appendChild(h('span', null, e.project));
    body.appendChild(top);

    const title = h('div', 'entry-title');
    title.appendChild(highlight(e.title, tokens));
    body.appendChild(title);

    const ex = excerptFor(e, tokens);
    if (ex) {
      const p = h('div', 'entry-excerpt');
      p.appendChild(highlight(ex, tokens));
      body.appendChild(p);
    }

    const tags = h('div', 'entry-tags');
    tags.appendChild(h('span', 'tag tag-type', e.type));
    const list = parseTags(e.tags);
    list.slice(0, 3).forEach(function (t) { tags.appendChild(h('span', 'tag', t)); });
    if (list.length > 3) tags.appendChild(h('span', 'tag', '+' + (list.length - 3)));
    body.appendChild(tags);

    btn.appendChild(body);
    li.appendChild(btn);
    return li;
  }

  function renderList() {
    const tokens = searchTokens();
    const filtered = applyFilters(tokens);
    const total = entries.length;
    const active = filtersActive();

    ui.entryList.textContent = '';
    const frag = document.createDocumentFragment();
    filtered.forEach(function (e) { frag.appendChild(buildCard(e, tokens)); });
    ui.entryList.appendChild(frag);

    ui.toolbar.hidden = total === 0;
    ui.btnClearFilters.hidden = !active;

    if (active && total > 0) {
      ui.resultsInfo.textContent = filtered.length + ' de ' + total + (total === 1 ? ' entrada' : ' entradas');
      ui.resultsInfo.hidden = false;
    } else {
      ui.resultsInfo.hidden = true;
    }

    if (total === 0) {
      ui.emptyTitle.textContent = EMPTY_DEFAULT.title;
      ui.emptyText.textContent = EMPTY_DEFAULT.text;
      ui.emptyNew.hidden = false;
      ui.emptyState.hidden = false;
    } else if (filtered.length === 0) {
      ui.emptyTitle.textContent = 'Sin resultados';
      ui.emptyText.textContent = 'Ninguna entrada coincide. Prueba con otras palabras o limpia los filtros.';
      ui.emptyNew.hidden = true;
      ui.emptyState.hidden = false;
    } else {
      ui.emptyState.hidden = true;
    }
  }

  function fillSelect(select, values, firstLabel, selected) {
    select.textContent = '';
    const first = h('option', null, firstLabel);
    first.value = '';
    select.appendChild(first);
    values.forEach(function (v) {
      const o = h('option', null, v);
      o.value = v;
      select.appendChild(o);
    });
    select.value = selected;
  }

  function renderFilterOptions() {
    const projects = [];
    entries.forEach(function (e) {
      if (e.project && projects.indexOf(e.project) === -1) projects.push(e.project);
    });
    projects.sort(function (a, b) { return a.localeCompare(b, 'es'); });

    if (filters.project && projects.indexOf(filters.project) === -1) filters.project = '';
    fillSelect(ui.filterProject, projects, 'Todos', filters.project);
    if (ui.filterProject.value !== filters.project) ui.filterProject.value = '';

    ui.projectOptions.textContent = '';
    projects.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p;
      ui.projectOptions.appendChild(o);
    });
  }

  function fillTypeSelects() {
    fillSelect(ui.filterType, DB.TYPES, 'Todos', '');
    ui.fType.textContent = '';
    DB.TYPES.forEach(function (t) {
      const o = h('option', null, t);
      o.value = t;
      ui.fType.appendChild(o);
    });
  }

  /* ---------- Vistas y navegación ---------- */
  function showView(name) {
    ui.viewList.hidden = name !== 'list';
    ui.viewDetail.hidden = name !== 'detail';
    ui.viewEditor.hidden = name !== 'editor';
    document.body.dataset.view = name;
    window.scrollTo(0, 0);
  }

  function currentDepth() {
    return (history.state && history.state.depth) || 0;
  }

  function navigate(view, id, opts) {
    opts = opts || {};
    const state = {
      view: view,
      id: id || null,
      from: opts.from || null,
      depth: opts.replace ? currentDepth() : currentDepth() + 1
    };
    if (opts.replace) history.replaceState(state, '');
    else history.pushState(state, '');
  }

  function goBack() {
    if (currentDepth() > 0) history.back();
    else showList();
  }

  /** Vuelve a la lista saltando todas las pantallas intermedias. */
  function goList() {
    const d = currentDepth();
    if (d > 0) history.go(-d);
    else showList();
  }

  function showList() {
    current = null;
    detailId = null;
    renderList();
    showView('list');
  }

  function openDetail(id) {
    navigate('detail', id);
    showDetailView(id);
  }

  function openEditor(id, from) {
    navigate('editor', id, { from: from });
    showEditorView(id);
  }

  /* ---------- Detalle (visor) ---------- */
  function showDetailView(id) {
    const e = byId(id);
    if (!e) { showList(); return; }
    detailId = id;

    ui.detailNumber.textContent = String(numbers.get(id) || '');
    ui.detailDate.textContent = formatDateLong(e.date);
    ui.detailDate.setAttribute('datetime', e.date);
    ui.detailTitle.textContent = e.title;
    ui.detailType.textContent = e.type;
    ui.detailProject.textContent = e.project || 'Sin proyecto';

    ui.detailTags.textContent = '';
    parseTags(e.tags).forEach(function (t) { ui.detailTags.appendChild(h('li', 'tag', t)); });

    if (e.content && e.content.trim()) linkify(ui.detailContent, e.content);
    else ui.detailContent.textContent = 'Sin notas.';

    ui.detailCodeWrap.hidden = !(e.codeSnippet && e.codeSnippet.trim());
    ui.detailCode.textContent = e.codeSnippet || '';

    const hasLinks = !!(e.links && e.links.trim());
    ui.detailLinksWrap.hidden = !hasLinks;
    if (hasLinks) linkify(ui.detailLinks, e.links);

    ui.detailCreated.textContent = 'Creada: ' + formatDateTime(e.createdAt);
    const edited = new Date(e.updatedAt) - new Date(e.createdAt) > 1000;
    ui.detailUpdated.textContent = edited ? 'Editada: ' + formatDateTime(e.updatedAt) : '';
    ui.detailUpdated.hidden = !edited;

    showView('detail');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- Editor ---------- */
  function setStatus(state) {
    const labels = {
      dirty: 'Sin guardar',
      saving: 'Guardando…',
      saved: 'Guardado',
      error: 'No se pudo guardar',
      notitle: 'Falta el título'
    };
    ui.saveStatus.textContent = labels[state] || '';
    ui.saveStatus.dataset.state = state || '';
  }

  function clearTitleError() {
    const field = ui.fTitle.closest('.field');
    if (field) field.classList.remove('has-error');
    ui.errTitle.hidden = true;
    ui.fTitle.removeAttribute('aria-invalid');
  }

  function showTitleError() {
    const field = ui.fTitle.closest('.field');
    if (field) field.classList.add('has-error');
    ui.errTitle.hidden = false;
    ui.fTitle.setAttribute('aria-invalid', 'true');
    ui.fTitle.focus();
  }

  function showEditorView(id) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const existing = id ? byId(id) : null;

    if (existing) {
      current = Object.assign({}, existing);
      currentPersisted = true;
    } else {
      current = DB.createBlank();
      currentPersisted = false;
    }

    ui.fDate.value = current.date;
    ui.fTitle.value = current.title;
    ui.fType.value = current.type;
    ui.fProject.value = current.project;
    ui.fTags.value = current.tags;
    ui.fContent.value = current.content;
    ui.fCode.value = current.codeSnippet;
    ui.fLinks.value = current.links;

    ui.editorNumber.textContent = String(numbers.get(current.id) || (entries.length + 1));
    ui.editorDelete.hidden = !currentPersisted;
    dirty = false;
    setStatus('');
    clearTitleError();
    showView('editor');
    if (!currentPersisted) ui.fTitle.focus();
  }

  function readForm() {
    return Object.assign({}, current, {
      date: ui.fDate.value || DB.todayLocal(),
      title: ui.fTitle.value.trim(),
      type: ui.fType.value,
      project: ui.fProject.value.trim(),
      tags: ui.fTags.value.trim(),
      content: ui.fContent.value,
      codeSnippet: ui.fCode.value,
      links: ui.fLinks.value
    });
  }

  function hasBodyContent() {
    return [ui.fProject, ui.fTags, ui.fContent, ui.fCode, ui.fLinks].some(function (f) {
      return f.value.trim() !== '';
    });
  }

  /** Guarda la entrada del editor. Devuelve la entrada guardada o null. */
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const draft = readForm();
    if (!draft.title) return Promise.resolve(null);

    dirty = false;
    setStatus('saving');
    saving = saving
      .then(function () { return DB.save(draft); })
      .then(function (saved) {
        const firstSave = !currentPersisted;
        current = saved;
        currentPersisted = true;
        upsert(saved);
        ui.editorNumber.textContent = String(numbers.get(saved.id) || '');
        ui.editorDelete.hidden = false;
        setStatus(dirty ? 'dirty' : 'saved');
        if (firstSave && navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(function () {});
        }
        return saved;
      })
      .catch(function (err) {
        dirty = true;
        setStatus('error');
        toast('No se pudo guardar: ' + (err && err.message ? err.message : 'error desconocido'), 5000);
        return null;
      });
    return saving;
  }

  function markDirty() {
    dirty = true;
    if (ui.fTitle.value.trim()) {
      clearTitleError();
      setStatus('dirty');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 700);
    } else {
      clearTimeout(saveTimer);
      saveTimer = null;
      setStatus('notitle');
    }
  }

  async function flushEditor() {
    if (dirty && ui.fTitle.value.trim()) await persist();
  }

  async function closeEditor() {
    if (dirty && !ui.fTitle.value.trim()) {
      if (hasBodyContent()) {
        const ok = await confirmDialog({
          title: 'Entrada sin título',
          text: 'No se puede guardar sin título. Si sales ahora, se perderán los cambios.',
          ok: 'Salir sin guardar'
        });
        if (!ok) return;
      }
      clearTimeout(saveTimer);
      saveTimer = null;
      dirty = false;
    }
    goBack();
  }

  /* ---------- Confirmación y borrado ---------- */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      if (typeof ui.dialog.showModal !== 'function') {
        resolve(window.confirm(opts.text));
        return;
      }
      ui.confirmTitle.textContent = opts.title;
      ui.confirmText.textContent = opts.text;
      ui.confirmOk.textContent = opts.ok || 'Eliminar';
      ui.dialog.returnValue = '';
      const onClose = function () {
        ui.dialog.removeEventListener('close', onClose);
        resolve(ui.dialog.returnValue === 'ok');
      };
      ui.dialog.addEventListener('close', onClose);
      ui.dialog.showModal();
    });
  }

  async function deleteEntry(id) {
    const e = byId(id);
    if (!e) return;
    const ok = await confirmDialog({
      title: '¿Eliminar entrada?',
      text: '«' + e.title + '» se eliminará de este dispositivo. Esta acción no se puede deshacer.',
      ok: 'Eliminar'
    });
    if (!ok) return;

    // Evita que el autoguardado la vuelva a crear.
    clearTimeout(saveTimer);
    saveTimer = null;
    dirty = false;
    try {
      await saving;
      await DB.remove(id);
      entries = entries.filter(function (x) { return x.id !== id; });
      recomputeNumbers();
      renderFilterOptions();
      current = null;
      toast('Entrada eliminada');
      goList();
    } catch (err) {
      toast('No se pudo eliminar: ' + (err && err.message ? err.message : 'error desconocido'), 5000);
    }
  }

  /* ---------- Exportar e importar ---------- */
  async function exportJSON() {
    ui.menu.open = false;
    try {
      const data = await DB.exportAll();
      if (!data.count) { toast('Todavía no hay entradas para exportar.'); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bitacora-dev-' + DB.todayLocal() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Copia descargada: ' + data.count + (data.count === 1 ? ' entrada' : ' entradas'));
    } catch (err) {
      toast('No se pudo exportar: ' + err.message, 5000);
    }
  }

  async function importJSON(file) {
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('el archivo no es un JSON válido.'); }
      const r = await DB.importAll(data);
      await reloadEntries();
      renderList();
      const parts = [];
      if (r.added) parts.push(r.added + (r.added === 1 ? ' nueva' : ' nuevas'));
      if (r.updated) parts.push(r.updated + (r.updated === 1 ? ' actualizada' : ' actualizadas'));
      if (r.skipped) parts.push(r.skipped + ' sin cambios');
      if (r.invalid) parts.push(r.invalid + ' omitidas por no ser válidas');
      toast('Importación lista: ' + (parts.join(', ') || 'sin entradas'), 5000);
    } catch (err) {
      toast('No se pudo importar: ' + err.message, 5000);
    }
  }

  /* ---------- Conexión, instalación y service worker ---------- */
  function updateConnection() {
    const online = navigator.onLine !== false;
    ui.connStatus.textContent = online ? 'En línea' : 'Sin conexión';
    ui.connStatus.className = 'chip ' + (online ? 'chip-online' : 'chip-offline');
    ui.connStatus.title = online ? '' : 'Sin conexión: la app y tus datos siguen disponibles.';
  }

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      deferredInstall = ev;
      ui.btnInstall.hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      deferredInstall = null;
      ui.btnInstall.hidden = true;
      toast('App instalada');
    });
    ui.btnInstall.addEventListener('click', async function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) { /* sin acción */ }
      deferredInstall = null;
      ui.btnInstall.hidden = true;
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (err) {
        console.warn('Service worker no registrado:', err);
      });
    });
  }

  /** Descarga la última versión de la app y la reinicia. No toca las entradas. */
  async function updateApp() {
    ui.menu.open = false;
    if (navigator.onLine === false) {
      toast('Necesitas conexión para buscar una actualización.', 4000);
      return;
    }
    if (document.body.dataset.view === 'editor') await flushEditor();
    toast('Buscando actualización…', 6000);
    try {
      const shell = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'manifest.webmanifest', 'sw.js'];
      // 1) Refresca la caché HTTP del navegador con los archivos más recientes.
      await Promise.all(shell.map(function (u) { return fetch(u, { cache: 'reload' }); }));
      // 2) Elimina el service worker y las cachés de la app (las entradas no se tocan).
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(function (k) { return k.indexOf('bitacora-dev-') === 0; })
          .map(function (k) { return caches.delete(k); }));
      }
      toast('Aplicación actualizada. Reiniciando…', 2000);
      setTimeout(function () { window.location.reload(); }, 700);
    } catch (err) {
      toast('No se pudo actualizar. Revisa tu conexión e inténtalo de nuevo.', 5000);
    }
  }

  /* ---------- Aviso de datos locales ---------- */
  function noticeSeen() {
    try { return localStorage.getItem(NOTICE_KEY) === '1'; } catch (e) { return false; }
  }
  function markNoticeSeen() {
    try { localStorage.setItem(NOTICE_KEY, '1'); } catch (e) { /* ignorar */ }
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    // Lista
    ui.entryList.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.entry-link');
      if (btn) openDetail(btn.dataset.id);
    });

    let searchTimer = null;
    ui.search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        filters.q = ui.search.value;
        renderList();
      }, 150);
    });
    ui.filterType.addEventListener('change', function () {
      filters.type = ui.filterType.value;
      renderList();
    });
    ui.filterProject.addEventListener('change', function () {
      filters.project = ui.filterProject.value;
      renderList();
    });
    ui.btnClearFilters.addEventListener('click', function () {
      filters.q = '';
      filters.type = '';
      filters.project = '';
      ui.search.value = '';
      ui.filterType.value = '';
      ui.filterProject.value = '';
      renderList();
    });

    ui.fab.addEventListener('click', function () { openEditor(null, 'list'); });
    ui.emptyNew.addEventListener('click', function () { openEditor(null, 'list'); });

    // Detalle
    ui.detailBack.addEventListener('click', goBack);
    ui.detailEdit.addEventListener('click', function () { if (detailId) openEditor(detailId, 'detail'); });
    ui.detailDelete.addEventListener('click', function () { if (detailId) deleteEntry(detailId); });
    ui.detailCopy.addEventListener('click', async function () {
      const ok = await copyText(ui.detailCode.textContent);
      toast(ok ? 'Código copiado' : 'No se pudo copiar el código');
    });

    // Editor
    ui.form.addEventListener('input', markDirty);
    ui.form.addEventListener('change', markDirty);
    ui.form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!ui.fTitle.value.trim()) { showTitleError(); return; }
      const saved = await persist();
      if (!saved) return;
      toast('Entrada guardada');
      const s = history.state;
      if (s && s.view === 'editor' && s.from === 'detail') {
        history.back();
      } else {
        navigate('detail', saved.id, { replace: true });
        showDetailView(saved.id);
      }
    });
    ui.editorBack.addEventListener('click', closeEditor);
    ui.editorDelete.addEventListener('click', function () {
      if (current && currentPersisted) deleteEntry(current.id);
    });

    // Menú, exportar e importar
    ui.btnExport.addEventListener('click', exportJSON);
    ui.noticeExport.addEventListener('click', exportJSON);
    ui.btnImport.addEventListener('click', function () {
      ui.menu.open = false;
      ui.importFile.click();
    });
    ui.importFile.addEventListener('change', function () {
      const file = ui.importFile.files && ui.importFile.files[0];
      ui.importFile.value = '';
      if (file) importJSON(file);
    });
    ui.btnUpdate.addEventListener('click', updateApp);
    ui.noticeClose.addEventListener('click', function () {
      ui.notice.hidden = true;
      markNoticeSeen();
    });

    document.addEventListener('click', function (ev) {
      if (ui.menu.open && !ui.menu.contains(ev.target)) ui.menu.open = false;
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && ui.menu.open) ui.menu.open = false;
      const inEditor = document.body.dataset.view === 'editor';
      if (inEditor && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        ui.btnSave.click();
      }
    });

    // Historial: el botón "atrás" del móvil recorre las vistas
    window.addEventListener('popstate', async function (ev) {
      if (document.body.dataset.view === 'editor') await flushEditor();
      const s = ev.state;
      if (!s || s.view === 'list') showList();
      else if (s.view === 'detail') showDetailView(s.id);
      else if (s.view === 'editor') showEditorView(s.id);
    });

    // Guarda lo pendiente si la app pasa a segundo plano
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (document.body.dataset.view === 'editor') flushEditor();
      } else {
        setToday();
      }
    });
    window.addEventListener('pagehide', function () {
      if (document.body.dataset.view === 'editor') flushEditor();
    });

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
  }

  /* ---------- Arranque ---------- */
  function setToday() {
    ui.todayLabel.textContent = capitalize(
      new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    );
  }

  function showFatal(message) {
    ui.dbErrorText.textContent = message;
    ui.dbError.hidden = false;
    ui.app.hidden = true;
  }

  async function init() {
    setToday();
    updateConnection();
    registerServiceWorker();
    setupInstall();

    if (!DB || !DB.isSupported()) {
      showFatal('IndexedDB no está disponible en este navegador. Prueba con otro navegador o sal del modo privado.');
      return;
    }

    try {
      await DB.open();
      await reloadEntries();
    } catch (err) {
      showFatal('No se pudo abrir la base de datos local: ' + (err && err.message ? err.message : 'error desconocido'));
      return;
    }

    fillTypeSelects();
    bindEvents();
    ui.notice.hidden = noticeSeen();

    history.replaceState({ view: 'list', id: null, from: null, depth: 0 }, '');
    showList();
  }

  init();
})();
