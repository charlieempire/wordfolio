(() => {
  const storageKey = 'ciye.wordfolio.shortcuts.v1';
  const defaults = {quizPrev:'ArrowLeft', quizReveal:'Space', quizNext:'ArrowRight'};
  const dialog = $('prefsBox');
  const names = {ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'空格',Meta:'⌘ / Win',Plus:'+'};
  const modifiers = ['Control','Alt','Shift','Meta','AltGraph'];
  const commands = [
    ['检验模式','quiz',[
      ['quizPrev','上一个单词'],['quizReveal','显示 / 隐藏翻译'],['quizNext','下一个单词'],
      ['quizMarkMastered','将当前词条移入已会词表'],
      ['quizSmaller','减小检验字号'],['quizLarger','增大检验字号'],['quizAll','全选 / 取消全选待学词表'],['quizMastered','检验已会词表']]],
    ['词表管理','list',[
      ['query','搜索单词或释义'],['all','全选 / 取消全选词条'],['move','移入 / 移出简单词表'],
      ['moveMastered','移入 / 移出已会词表'],['smaller','减小列表字号'],['larger','增大列表字号'],['listAll','查看全部词汇']]],
    ['页面导航','main',[
      ['study','打开学习词表'],['easy','打开简单词表'],['mastered','打开已会词表'],['quiz','打开检验模式'],
      ['openImport','导入词表'],['openPrefs','打开偏好设置']]],
    ['导入窗口','import',[['pick','选择文件'],['dismiss','关闭导入窗口'],['exportBackup','导出个人备份'],['pickBackup','导入个人备份']]]
  ].flatMap(([group,scope,items])=>items.map(([id,label])=>({group,scope,id,label})));
  function actions() {
    return commands.concat(state.lists.flatMap(list => [
      {id:'list:'+list.id,label:'查看：'+list.name,scope:'list',group:'指定词表',listId:list.id},
      {id:'quiz:'+list.id,label:'勾选 / 取消：'+list.name,scope:'quiz',group:'指定词表',listId:list.id}
    ]));
  }
  function target(action) {
    if (action.id==='listAll') return document.querySelector('#sources .all');
    if (action.listId!==undefined) {
      const id=CSS.escape(action.listId);
      return document.querySelector(action.scope==='quiz' ? '#quizSources input[value="'+id+'"]' : '#sources [data-source-id="'+id+'"]');
    }
    return $(action.id);
  }
  function read() {
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey));
      return {...defaults,...Object.fromEntries(Object.entries(saved||{}).filter(([,v])=>typeof v==='string'))};
    } catch { return {...defaults}; }
  }
  let bindings=read(), draft={}, editing=null, tabFocus=false;
  const rows=new Map();
  const format=chord=>chord.split('+').map(key=>names[key]||key).join(' + ');
  function syncHints() {
    for (const action of actions()) {
      const el=target(action);
      if (el) el.title=bindings[action.id] ? action.label+'（'+format(bindings[action.id])+'）' : action.label;
    }
  }
  function draw() {
    for (const [id,{bind,clear}] of rows) {
      bind.textContent=editing===id?'请按键…':draft[id]?format(draft[id]):'未设置';
      bind.setAttribute('aria-pressed',editing===id);
      clear.disabled=!draft[id];
    }
  }
  function openPrefs() {
    draft={...bindings}; editing=null; rows.clear();
    const groups=new Map(), container=$('bindings');
    container.replaceChildren();
    for (const action of actions()) {
      if (!groups.has(action.group)) {
        const folded=action.group==='指定词表', group=element(folded?'details':'section');
        group.append(element(folded?'summary':'h3','',action.group));
        groups.set(action.group,group); container.append(group);
      }
      const row=element('div','binding-row'),bind=element('button','bind-key'),clear=element('button','bind-clear','清除');
      bind.setAttribute('aria-label','设置快捷键：'+action.label);
      clear.setAttribute('aria-label','清除快捷键：'+action.label);
      bind.onclick=()=>{
        editing=action.id; draw(); $('prefsMessage').textContent='按下新快捷键，Esc 取消录制。';
      };
      clear.onclick=()=>{
        editing=null; draft[action.id]=''; draw(); $('prefsMessage').textContent='已清除，保存后生效。';
      };
      rows.set(action.id,{bind,clear});
      row.append(element('span','',action.label),bind,clear); groups.get(action.group).append(row);
    }
    draw(); $('prefsMessage').textContent=''; dialog.showModal(); container.scrollTop=0;
  }
  $('openPrefs').onclick=openPrefs;
  $('prefsCancel').onclick=()=>dialog.close();
  dialog.onclose=()=>{editing=null;};
  $('prefsDefaults').onclick=()=>{
    editing=null; draft={...defaults}; draw(); $('prefsMessage').textContent='已恢复默认，保存后生效。';
  };
  $('prefsSave').onclick=()=>{
    try {localStorage.setItem(storageKey,JSON.stringify(draft));}
    catch {$('prefsMessage').textContent='保存失败，请检查浏览器存储空间。'; return;}
    bindings={...draft}; syncHints(); dialog.close(); toast('快捷键已保存');
  };
  window.addEventListener('storage',e=>{if(e.key===storageKey){bindings=read();syncHints();}});
  window.addEventListener('wordfolio-restore',()=>{bindings=read();syncHints();});
  function chordOf(e) {
    const key=e.key;
    if (modifiers.includes(key)) return '';
    const base=key===' '?'Space':key==='+'?'Plus':/^[a-z]$/i.test(key)?key.toUpperCase():key;
    return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',base].filter(Boolean).join('+');
  }
  function overlaps(a,b) {
    return a===b || ((a==='main'||b==='main') && a!=='import' && b!=='import');
  }
  function record(e,chord) {
    if(e.key==='Tab'){editing=null;draw();$('prefsMessage').textContent='';return;}
    e.preventDefault(); e.stopPropagation();
    if(e.key==='Escape'){editing=null;draw();$('prefsMessage').textContent='已取消录制。';return;}
    if(!chord||e.repeat)return;
    const macOrCtrl=e.metaKey||e.ctrlKey;
    if(['Dead','Unidentified','Process','CapsLock','NumLock','Fn'].includes(e.key) ||
        (macOrCtrl && /^[lnqrtw]$/i.test(e.key)) || (e.altKey&&e.key==='F4') || ['F5','F11'].includes(e.key)){
      $('prefsMessage').textContent='这个按键由浏览器或系统使用，请换一个。';return;
    }
    const options=actions(), current=options.find(a=>a.id===editing);
    if(!current){editing=null;draw();return;}
    const used=options.find(a=>a.id!==editing && draft[a.id]===chord && overlaps(a.scope,current.scope));
    if(used){$('prefsMessage').textContent='已用于「'+used.label+'」，请换一个键或先清除原绑定。';return;}
    draft[editing]=chord;editing=null;draw();$('prefsMessage').textContent='已设置，保存后生效。';
  }
  document.addEventListener('pointerdown',()=>{tabFocus=false;},true);
  document.addEventListener('keydown',e=>{
    if(e.isComposing || e.keyCode===229 || e.defaultPrevented)return;
    if(e.key==='Tab')tabFocus=true;
    if(dialog.open){if(editing)record(e,chordOf(e));return;}
    if(!ready || $('backupBox').open || e.key==='Tab' || e.key==='Escape')return;
    const el=e.target;
    if(el.isContentEditable || el.closest('textarea,select,[role="textbox"],input:not([type="checkbox"]):not([type="button"])'))return;
    const plainActivate=!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey&&(e.key==='Enter'||e.key===' ');
    if(plainActivate && (el.matches('input[type="checkbox"]')||tabFocus&&el.closest('button,a,summary')))return;
    const chord=chordOf(e);
    if(!chord || !Object.values(bindings).includes(chord))return;
    const scope=$('importBox').open?'import':mode==='quiz'?'quiz':'list';
    const action=actions().find(a=>bindings[a.id]===chord && (a.scope===scope || (a.scope==='main' && scope!=='import')));
    if(!action)return;
    const control=target(action);
    if(!control || control.disabled || !control.getClientRects().length)return;
    e.preventDefault(); e.stopPropagation();
    if(e.repeat)return;
    if(action.id==='query')control.focus();else control.click();
  },true);
  syncHints();
})();
