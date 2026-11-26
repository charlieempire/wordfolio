// Keep the vocabulary and the simple-word index in one atomic transaction.
function createLibraryStore(legacyKey, defaults) {
  let database, connecting, localOnly = false;
  const valid = value => value?.version === 1 && Array.isArray(value.lists) && Array.isArray(value.easy);
  function previousLibrary() {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return defaults();
    const saved = JSON.parse(raw);
    if (!valid(saved)) throw Error('旧词库读取失败，已保留原数据');
    return saved;
  }
  function disconnect(db) {
    if (database === db) database = null;
    db?.close();
  }
  function connect() {
    if (database) return Promise.resolve(database);
    if (connecting) return connecting;
    connecting = new Promise((resolve, reject) => {
      const request = indexedDB.open('ciye.wordfolio.library', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('settings');
        request.result.createObjectStore('simpleWords', {keyPath:'key'});
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => { if (database === db) database = null; };
        db.onversionchange = () => disconnect(db);
        database = db;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).finally(() => { connecting = null; });
    return connecting;
  }
  function transient(error) {
    return ['InvalidStateError','UnknownError','AbortError','TransactionInactiveError'].includes(error?.name);
  }
  async function open() {
    try { await connect(); }
    catch (error) {
      if (transient(error)) return run(null,true);
      // Keep the legacy storage path for browsers without IndexedDB support.
      if (error.name === 'VersionError' || error.name === 'QuotaExceededError') throw error;
      localOnly = true;
      return previousLibrary();
    }
    return run(null, true);
  }
  async function run(change, initialize = false, writePreferences) {
    if (localOnly) {
      const state = previousLibrary();
      if (change) {
        change(state);
        const undo = writePreferences?.();
        try { localStorage.setItem(legacyKey, JSON.stringify(state)); }
        catch (error) { undo?.(); throw error; }
      }
      return state;
    }
    let db;
    try {
      db = await connect();
      return await transact(db,change,initialize,writePreferences);
    } catch (error) {
      // Safari may discard the connection while a file picker is open.
      if (!transient(error)) throw error;
      disconnect(db);
      return transact(await connect(),change,initialize,writePreferences);
    }
  }
  function transact(db, change, initialize, writePreferences) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(['settings','simpleWords'], change || initialize ? 'readwrite' : 'readonly');
      const settings = tx.objectStore('settings'), words = tx.objectStore('simpleWords');
      const meta = settings.get('library'), keys = words.getAllKeys();
      let state, problem, undoPreferences;
      keys.onsuccess = () => {
        try {
          state = meta.result ? {...meta.result, easy:[...keys.result]} : previousLibrary();
          if (change) change(state);
          if (!change && meta.result) return;
          const {easy,...rest} = state;
          settings.put(rest,'library');
          const before = new Set(keys.result), after = new Set(easy);
          for (const key of before) if (!after.has(key)) words.delete(key);
          // A replacement can also change the meaning of an existing simple word.
          const newWords = writePreferences ? after : new Set([...after].filter(key => !before.has(key)));
          if (newWords.size) {
            for (const list of state.lists) for (const [english, meaning] of list.rows) {
              const key = normalize(english);
              if (newWords.delete(key)) words.put({key,english,meaning});
            }
          }
          undoPreferences = writePreferences?.();
        } catch (error) { problem=error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(state);
      tx.onabort = () => {
        try { undoPreferences?.(); }
        finally { reject(problem || tx.error || new DOMException('保存操作中断','AbortError')); }
      };
    });
  }
  return {open, read:() => run(null), update:change => run(change),
    replace:(next, writePreferences) => run(data => Object.assign(data,next), false, writePreferences)};
}
