// Keep the vocabulary and the simple-word index in one atomic transaction.
function createLibraryStore(legacyKey, defaults) {
  let database;
  const valid = value => value?.version === 1 && Array.isArray(value.lists) && Array.isArray(value.easy);
  function previousLibrary() {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return defaults();
    const saved = JSON.parse(raw);
    if (!valid(saved)) throw Error('旧词库读取失败，已保留原数据');
    return saved;
  }
  async function open() {
    try {
      database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('ciye.wordfolio.library', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('settings');
          request.result.createObjectStore('simpleWords', {keyPath:'key'});
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Browsers without IndexedDB retain the previous local storage format.
      return previousLibrary();
    }
    return run(null, true);
  }
  function run(change, initialize = false) {
    if (!database) {
      const state = previousLibrary();
      if (change) { change(state); localStorage.setItem(legacyKey, JSON.stringify(state)); }
      return Promise.resolve(state);
    }
    return new Promise((resolve,reject) => {
      const tx = database.transaction(['settings','simpleWords'], change || initialize ? 'readwrite' : 'readonly');
      const settings = tx.objectStore('settings'), words = tx.objectStore('simpleWords');
      const meta = settings.get('library'), keys = words.getAllKeys();
      let state, problem;
      keys.onsuccess = () => {
        try {
          state = meta.result ? {...meta.result, easy:keys.result} : previousLibrary();
          if (change) change(state);
          if (!change && meta.result) return;
          const {easy,...rest} = state;
          settings.put(rest,'library');
          const before = new Set(keys.result), after = new Set(easy);
          for (const key of before) if (!after.has(key)) words.delete(key);
          const newWords = new Set([...after].filter(key => !before.has(key)));
          if (newWords.size) {
            for (const list of state.lists) for (const [english, meaning] of list.rows) {
              const key = normalize(english);
              if (newWords.delete(key)) words.put({key,english,meaning});
            }
          }
        } catch (error) { problem=error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(state);
      tx.onabort = () => reject(problem || tx.error || Error('保存未完成'));
    });
  }
  return {open, read:() => run(null), update:change => run(change)};
}
