/* db.js — Capa de datos de Bitácora Dev (IndexedDB, sin dependencias).
 * Expone el objeto global `BitacoraDB`. */
(function () {
  'use strict';

  const DB_NAME = 'bitacora-dev';
  const DB_VERSION = 1;
  const STORE = 'entries';
  const EXPORT_FORMAT = 'bitacora-dev';
  const EXPORT_VERSION = 1;
  const TYPES = ['Registro diario', 'Bug', 'Decisión', 'Idea', 'Snippet'];

  let dbPromise = null;

  function isSupported() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  /** Abre (o crea) la base de datos. Reutiliza la misma conexión. */
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!isSupported()) {
        reject(new Error('IndexedDB no está disponible en este navegador.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function () {
        const db = req.result;
        const store = db.objectStoreNames.contains(STORE)
          ? req.transaction.objectStore(STORE)
          : db.createObjectStore(STORE, { keyPath: 'id' });
        ['date', 'updatedAt', 'project', 'type'].forEach(function (name) {
          if (!store.indexNames.contains(name)) store.createIndex(name, name);
        });
      };

      req.onsuccess = function () {
        const db = req.result;
        // Si otra pestaña actualiza la BD, cerramos para no bloquearla.
        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () {
        reject(new Error('La base de datos está bloqueada por otra pestaña. Ciérrala e inténtalo de nuevo.'));
      };
    });
    // Si falla, permitimos reintentar en la próxima llamada.
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  /** Ejecuta una operación en una transacción y resuelve al completarla. */
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Transacción cancelada.')); };
      });
    });
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** Fecha local en formato YYYY-MM-DD (no UTC). */
  function todayLocal() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function str(v) {
    return typeof v === 'string' ? v : (v == null ? '' : String(v));
  }

  /** Devuelve una entrada con todos los campos y tipos correctos. */
  function normalize(raw) {
    const now = new Date().toISOString();
    const tags = Array.isArray(raw.tags) ? raw.tags.join(', ') : str(raw.tags);
    return {
      id: str(raw.id) || uuid(),
      createdAt: str(raw.createdAt) || now,
      updatedAt: str(raw.updatedAt) || now,
      date: str(raw.date) || todayLocal(),
      title: str(raw.title).trim(),
      project: str(raw.project).trim(),
      type: TYPES.indexOf(raw.type) !== -1 ? raw.type : TYPES[0],
      tags: tags,
      content: str(raw.content),
      codeSnippet: str(raw.codeSnippet),
      links: str(raw.links)
    };
  }

  /** Crea una entrada vacía (aún no guardada). */
  function createBlank() {
    return normalize({});
  }

  /** Guarda (crea o actualiza) una entrada. Actualiza updatedAt. */
  function save(entry) {
    const e = normalize(entry);
    e.updatedAt = new Date().toISOString();
    return run('readwrite', function (store) { return store.put(e); }).then(function () { return e; });
  }

  function get(id) {
    return run('readonly', function (store) { return store.get(id); });
  }

  function remove(id) {
    return run('readwrite', function (store) { return store.delete(id); });
  }

  /** Todas las entradas, de la más reciente a la más antigua. */
  function getAll() {
    return run('readonly', function (store) { return store.getAll(); }).then(function (list) {
      return (list || []).sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
    });
  }

  /** Objeto listo para descargar como copia de seguridad. */
  function exportAll() {
    return getAll().then(function (entries) {
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries
      };
    });
  }

  /**
   * Importa una copia de seguridad (objeto exportado o arreglo de entradas).
   * Fusiona por id: si ya existe, conserva la más reciente (updatedAt).
   * Devuelve { added, updated, skipped, invalid }.
   */
  function importAll(data) {
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : null);
    if (!list) {
      return Promise.reject(new Error('El archivo no tiene el formato de una copia de Bitácora Dev.'));
    }
    const result = { added: 0, updated: 0, skipped: 0, invalid: 0 };

    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);

        list.forEach(function (raw) {
          if (!raw || typeof raw !== 'object' || !str(raw.title).trim()) {
            result.invalid++;
            return;
          }
          const incoming = normalize(raw);
          const getReq = store.get(incoming.id);
          getReq.onsuccess = function () {
            const existing = getReq.result;
            if (!existing) {
              store.put(incoming);
              result.added++;
            } else if (incoming.updatedAt > existing.updatedAt) {
              store.put(incoming);
              result.updated++;
            } else {
              result.skipped++;
            }
          };
        });

        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Importación cancelada.')); };
      });
    });
  }

  window.BitacoraDB = {
    TYPES: TYPES,
    isSupported: isSupported,
    open: open,
    uuid: uuid,
    todayLocal: todayLocal,
    createBlank: createBlank,
    save: save,
    get: get,
    remove: remove,
    getAll: getAll,
    exportAll: exportAll,
    importAll: importAll
  };
})();
