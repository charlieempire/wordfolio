const backupKeys = {view:viewKey, quiz:'ciye.wordfolio.quiz.v1', shortcuts:'ciye.wordfolio.shortcuts.v1'};
const backupEntry = 'wordfolio.json';

function readPreference(name) {
  return JSON.parse(localStorage.getItem(backupKeys[name]));
}

function restoreBackupView() {
  clearTimeout(viewTimer);
  quizMode.restore(readPreference('quiz'));
  const top = restoreView();
  render();
  window.dispatchEvent(new Event('wordfolio-restore'));
  window.scrollTo(0,top);
}

// The library transaction calls the undo function if it cannot commit.
function writeBackupPreferences(preferences) {
  const before = new Map();
  function undo() {
    for (const key of before.keys()) localStorage.removeItem(key);
    for (const [key,raw] of before) if (raw !== null) localStorage.setItem(key,raw);
  }
  try {
    for (const [name,key] of Object.entries(backupKeys)) {
      before.set(key,localStorage.getItem(key));
      localStorage.setItem(key,JSON.stringify(preferences[name]));
    }
  } catch (error) { undo(); throw error; }
  return undo;
}

function validateBackup(doc) {
  const invalid = () => { throw Error('备份数据不完整或格式有误，请重新选择文件。'); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  const integer = (n,min,max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (doc?.format !== 'wordfolio') throw Error('请选择由词页导出的 ZIP 备份或其中的 wordfolio.json。');
  if (doc.version !== 1) throw Error('此版本暂不能读取这个备份版本。');
  const lib = doc.library, pref = doc.preferences;
  if (lib?.version !== 1 || !integer(lib.size,15,29) || !Array.isArray(lib.lists) ||
      !strings(lib.easy) || !strings(lib.mastered) || !object(pref)) invalid();
  const ids = new Set(), words = new Set();
  for (const list of lib.lists) {
    if (!list || typeof list.id !== 'string' || !list.id || list.id === '*' || ids.has(list.id) ||
        typeof list.name !== 'string' || !Array.isArray(list.rows)) invalid();
    ids.add(list.id);
    for (const row of list.rows) {
      if (!strings(row) || row.length !== 2 || !normalize(row[0]) || !row[1].trim()) invalid();
      words.add(normalize(row[0]));
    }
  }
  const classified = new Set();
  for (const group of [lib.easy,lib.mastered]) {
    for (const word of group) {
      if (!words.has(word) || classified.has(word)) invalid();
      classified.add(word);
    }
  }
  const {view,quiz,shortcuts} = pref;
  if (!view || !['study','easy','mastered','quiz'].includes(view.mode) || typeof view.source !== 'string' ||
      typeof view.query !== 'string' || !strings(view.selected) || !Number.isFinite(view.scrollY)) invalid();
  if (!quiz || !(quiz.scope === null || strings(quiz.scope)) || !integer(quiz.size,20,80) ||
      !strings(quiz.order) || !integer(quiz.cursor,0,Math.max(0,quiz.order.length-1)) ||
      typeof quiz.revealed !== 'boolean' || typeof quiz.includeMastered !== 'boolean') invalid();
  if (!object(shortcuts) || !Object.values(shortcuts).every(value => typeof value === 'string')) invalid();
  return words.size;
}

async function readBackup(file) {
  let json;
  if (/\.json$/i.test(file.name)) json = await file.text();
  else {
    let zip;
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
    catch { throw Error('无法打开文件，请选择词页的 ZIP 或 JSON 备份。'); }
    const entry = zip.file(backupEntry);
    if (!entry) throw Error('压缩包中缺少 wordfolio.json，请选择词页的个人备份。');
    json = await entry.async('string');
  }
  let doc;
  try { doc = JSON.parse(json.replace(/^\uFEFF/,'')); }
  catch { throw Error('备份中的 JSON 无法读取，请重新选择文件。'); }
  const count = validateBackup(doc);
  const {version,size,lists,easy,mastered} = doc.library;
  doc.library = {version,size,lists:lists.map(({id,name,rows}) => ({id,name,rows})),easy,mastered};
  return {doc,count};
}

function supplementLibrary(local, incoming) {
  local.mastered ??= [];
  const classified = new Set([...local.easy,...local.mastered]);
  const lists = new Map(local.lists.map(list => [list.id,list]));
  let added = 0, marked = 0;
  for (const list of incoming.lists) {
    let target = lists.get(list.id);
    const known = englishInList(target);
    for (const row of list.rows) {
      const word = normalize(row[0]);
      if (classified.has(word) || known.has(word)) continue;
      if (!target) {
        target = {id:list.id,name:list.name,rows:[]};
        lists.set(list.id,target);
        local.lists.push(target);
      }
      known.add(word);
      target.rows.push(row);
      added++;
    }
  }
  for (const category of ['easy','mastered']) {
    for (const word of incoming[category]) if (!classified.has(word)) {
      local[category].push(word);
      classified.add(word);
      marked++;
    }
  }
  return '已补充 ' + added + ' 个新词条，新增 ' + marked + ' 个分类标记。';
}

(() => {
  const confirmBox = $('backupBox');
  let pending = null, busy = false;
  function setBusy(value) {
    busy = importing = value;
    for (const id of ['backupTools','pick','dismiss','cancelBackup','applyBackup','backupMerge','backupReplace']) $(id).disabled = value;
  }
  for (const box of [dialog,confirmBox]) box.addEventListener('cancel',event => { if (busy) event.preventDefault(); });

  $('exportBackup').onclick = async () => {
    if (importing) return;
    setBusy(true);
    try {
      const data = await library.read();
      const quiz = quizMode.snapshot();
      if (mode !== 'quiz') Object.assign(quiz,readPreference('quiz'));
      const doc = {format:'wordfolio',version:1,library:{...data,mastered:data.mastered || []},preferences:{
        view:currentView(),quiz,
        shortcuts:readPreference('shortcuts') || {}
      }};
      validateBackup(doc);
      const zip = new JSZip();
      zip.file(backupEntry,JSON.stringify(doc,null,2));
      const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      const now = new Date();
      const stamp = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,19).replace(/:/g,'-');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '词页备份-'+stamp+'.zip';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href),60000);
      $('result').textContent = '已导出 '+data.lists.length+' 张词表及个人设置。';
    } catch (error) { $('result').textContent = '导出失败。'+error.message; }
    finally { setBusy(false); }
  };

  $('pickBackup').onclick = () => $('backupFile').click();
  $('backupFile').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || importing) return;
    setBusy(true);
    try {
      const {doc,count} = await readBackup(file);
      pending = doc;
      $('backupSummary').textContent = file.name+' · '+doc.library.lists.length+' 张词表，'+count+' 个词条（简单词 '+doc.library.easy.length+'，已会词 '+doc.library.mastered.length+'）。';
      $('backupMerge').checked = true;
      $('applyBackup').textContent = '确认补充';
      $('backupStatus').textContent = '';
      dialog.close();
      confirmBox.showModal();
    } catch (error) { $('result').textContent = error.message; }
    finally { setBusy(false); }
  };

  confirmBox.onchange = () => { $('applyBackup').textContent = $('backupReplace').checked ? '确认全部替换' : '确认补充'; };
  $('cancelBackup').onclick = () => confirmBox.close();
  confirmBox.onclose = () => { pending = null; };
  $('applyBackup').onclick = async () => {
    if (!pending || importing) return;
    const {library:incoming,preferences} = pending;
    const replace = $('backupReplace').checked;
    setBusy(true);
    let message = '已恢复全部词表和个人设置。';
    $('backupStatus').textContent = '正在保存…';
    try {
      if (replace) state = await library.replace(incoming,() => writeBackupPreferences(preferences));
      else state = await library.update(local => { message = supplementLibrary(local,incoming); });
    } catch (error) {
      if (error.name === 'QuotaExceededError') $('backupStatus').textContent = '浏览器存储空间不足，未能保存备份。';
      else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') $('backupStatus').textContent = '浏览器未允许此网站保存数据，请检查网站权限后重试。';
      else $('backupStatus').textContent = '备份未保存，请重试或重新打开页面。' + (error.message || error.name);
      return;
    } finally { setBusy(false); }
    confirmBox.close();
    try {
      if (replace) restoreBackupView();
      else { quizMode.prepareMerge(state); render(); }
      const notice = replace ? 'backup-replaced' : 'backup-merged';
      if (updates) updates.postMessage(notice);
      else { try { localStorage.setItem('ciye.wordfolio.backup-notice',notice+':'+Date.now()); } catch {} }
      toast(message);
    } catch { toast('备份已保存，请刷新页面查看。'); }
  };
})();
