function createQuiz(markMastered) {
  const key = 'ciye.wordfolio.quiz.v1';
  let stored;
  try { stored = JSON.parse(localStorage.getItem(key)); } catch {}
  let scope, size, order, cursor, revealed, includeMastered, promptLanguage;
  let savingMastered = false;
  let pool = new Map(), lists = [], simple = new Set(), mastered = new Map();
  function restore(saved) {
    scope = Array.isArray(saved?.scope) ? new Set(saved.scope) : null;
    size = Number.isInteger(saved?.size) ? Math.max(20, Math.min(80, saved.size)) : 44;
    order = Array.isArray(saved?.order) ? saved.order : [];
    cursor = Number.isInteger(saved?.cursor) ? saved.cursor : 0;
    revealed = saved?.revealed === true;
    promptLanguage = saved?.promptLanguage === 'zh' ? 'zh' : 'en';
    includeMastered = saved?.includeMastered === true;
    pool = new Map();
  }
  restore(stored);
  function snapshot() {
    return {scope: scope === null ? null : [...scope], includeMastered, size, order, cursor, revealed, promptLanguage};
  }

  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(snapshot()));
    } catch { toast('检验设置未能保存，请检查浏览器存储'); }
  }
  function shuffleRound(last, keys = pool.keys()) {
    const round = [...keys];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    if (round.length > 1 && round[0] === last) {
      const j = 1 + Math.floor(Math.random() * (round.length - 1));
      [round[0], round[j]] = [round[j], round[0]];
    }
    return round;
  }
  function deckMatchesPool() {
    const n = pool.size;
    if (!n) return !order.length;
    if (![n, 2 * n].includes(order.length) || cursor < 0 || cursor >= order.length) return false;
    for (let i = 0; i < order.length; i += n) {
      const round = order.slice(i, i + n);
      if (new Set(round).size !== n || round.some(k => !pool.has(k))) return false;
    }
    return true;
  }
  function chineseClue(english, meaning) {
    // A usage note may repeat the answer, e.g. “根据（according to）”.
    const term = english.trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&').replace(/['‘’]/g, "['‘’]").replace(/\s+/g, '\\s+');
    return meaning.replace(new RegExp('(^|[^a-z0-9])' + term + '(?![a-z0-9])', 'gi'), '$1____');
  }
  function drawCard() {
    const pair = pool.get(order[cursor]);
    const chineseFirst = promptLanguage === 'zh';
    $('quizAskEnglish').setAttribute('aria-pressed', String(!chineseFirst));
    $('quizAskChinese').setAttribute('aria-pressed', String(chineseFirst));
    $('quizCount').textContent = pool.size + ' 词条';
    $('quizProgress').textContent = pair ? (cursor % pool.size + 1) + ' / ' + pool.size : '';
    const prompt = $('quizEnglish'), answer = $('quizMeaning');
    prompt.lang = chineseFirst ? 'zh-CN' : 'en';
    answer.lang = chineseFirst ? 'en' : 'zh-CN';
    let clue = pair?.[chineseFirst ? 1 : 0] || '';
    if (pair && chineseFirst && !revealed) clue = chineseClue(pair[0],pair[1]);
    prompt.textContent = clue;
    prompt.style.fontSize = size + 'px';
    answer.textContent = pair && revealed ? pair[chineseFirst ? 0 : 1] : '';
    answer.hidden = !pair || !revealed;
    $('quizEmpty').hidden = !!pair;
    $('quizEmpty').textContent = scope?.size === 0 && !includeMastered ? '请选择要检验的词表' : '所选词表暂无可检验的词条';
    $('quizReveal').textContent = (revealed && pair ? '隐藏' : '显示') + (chineseFirst ? '英文' : '翻译');
    $('quizReveal').setAttribute('aria-expanded', String(!!pair && revealed));
    $('quizReveal').disabled = !pair;
    $('quizPrev').disabled = !pair || cursor === 0;
    $('quizNext').disabled = pool.size < 2;
    const alreadyMastered = mastered.has(order[cursor]);
    $('quizMarkMastered').textContent = alreadyMastered ? '已在已会词表' : '移入已会词表';
    $('quizMarkMastered').disabled = !pair || alreadyMastered || savingMastered;
    $('quizSmaller').disabled = size <= 20;
    $('quizLarger').disabled = size >= 80;
  }
  const selectedLists = () => scope === null ? lists : lists.filter(list => scope.has(list.id));
  function buildPool(selected) {
    const result = indexRows(selected);
    for (const k of simple) result.delete(k);
    for (const [k,pair] of mastered) {
      if (includeMastered) result.set(k,pair); else result.delete(k);
    }
    return result;
  }
  function updateScope(forceShuffle = false) {
    const previousPool = pool;
    const selected = selectedLists();
    pool = buildPool(selected);
    if (!forceShuffle && pool.size && pool.size < previousPool.size && [...pool.keys()].every(k => previousPool.has(k))) {
      // Keep the surviving cards in order, including any previous round.
      const current = order[cursor];
      cursor = order.slice(0, cursor).filter(k => pool.has(k)).length;
      order = order.filter(k => pool.has(k));
      if (cursor === order.length) startNextRound();
      if (current !== order[cursor]) revealed = false;
      persist();
    } else if (forceShuffle || !deckMatchesPool()) {
      order = shuffleRound(); cursor = 0; revealed = false; persist();
    }
    $('quizAll').checked = !!lists.length && selected.length === lists.length;
    $('quizAll').indeterminate = selected.length > 0 && selected.length < lists.length;
    $('quizMastered').checked = includeMastered;
    for (const box of $('quizSources').querySelectorAll('input')) box.checked = scope === null || scope.has(box.value);
    drawCard();
  }
  function setSources(data, excluded, masteredKeys, entries) {
    lists = data; simple = excluded;
    mastered = new Map();
    for (const k of masteredKeys) if (entries.has(k)) mastered.set(k,entries.get(k));
  }
  function prepareMerge(data) {
    if (!order.length) return;
    setSources(data.lists, new Set(data.easy), data.mastered || [], indexRows(data.lists));
    pool = buildPool(selectedLists());
    if (deckMatchesPool()) return;
    const previous = new Set(order), roundSize = previous.size, current = order[cursor];
    const additions = [...pool.keys()].filter(k => !previous.has(k));
    const next = [];
    let position = 0;
    for (let i = 0; i < order.length; i += roundSize) {
      const kept = order.slice(i,i + roundSize).filter(k => pool.has(k));
      if (cursor >= i && cursor < i + roundSize) {
        position = next.length + order.slice(i,cursor).filter(k => pool.has(k)).length;
      }
      for (const k of kept) next.push(k);
      for (const k of shuffleRound(undefined, additions)) next.push(k);
    }
    order = next;
    cursor = position;
    if (!order.length) cursor = 0;
    else if (cursor === order.length) startNextRound();
    if (order[cursor] !== current) revealed = false;
    persist();
  }
  function show(data, excluded, masteredKeys, entries) {
    setSources(data, excluded, masteredKeys, entries);
    const fields = document.createDocumentFragment();
    for (const list of lists) {
      const label = element('label', 'quiz-source'), box = element('input');
      box.type = 'checkbox'; box.value = list.id;
      label.append(box, element('span', '', list.name)); fields.append(label);
    }
    $('quizSources').replaceChildren(fields);
    updateScope();
  }
  $('quizAll').onchange = event => { scope = event.target.checked ? null : new Set(); updateScope(true); };
  $('quizMastered').onchange = event => { includeMastered = event.target.checked; updateScope(true); };
  $('quizSources').onchange = event => {
    const box = event.target;
    if (scope === null) scope = new Set(lists.map(list => list.id));
    if (box.checked) scope.add(box.value); else scope.delete(box.value);
    if (lists.every(list => scope.has(list.id))) scope = null;
    updateScope(true);
  };
  function setPromptLanguage(language) {
    if (language === promptLanguage) return;
    promptLanguage = language;
    revealed = false;
    drawCard();
    persist();
  }
  $('quizAskEnglish').onclick = () => setPromptLanguage('en');
  $('quizAskChinese').onclick = () => setPromptLanguage('zh');
  $('quizReveal').onclick = () => { revealed = !revealed; drawCard(); persist(); };
  $('quizPrev').onclick = () => { cursor--; revealed = false; drawCard(); persist(); };
  function startNextRound() {
    // Keep the preceding round so Back works across a shuffle.
    order = order.slice(-pool.size).concat(shuffleRound(order[order.length - 1]));
    cursor = pool.size;
  }
  function nextCard() {
    if (cursor === order.length - 1) {
      startNextRound();
    } else cursor++;
    revealed = false; drawCard(); persist();
  }
  $('quizNext').onclick = nextCard;
  $('quizMarkMastered').onclick = async () => {
    const word = order[cursor];
    if (savingMastered || !pool.has(word) || mastered.has(word)) return;
    savingMastered = true;
    drawCard();
    try {
      const saved = await markMastered(word);
      // A mixed quiz still includes the marked card in its deck.
      if (saved && !$('quizWorkspace').hidden && order[cursor] === word && mastered.has(word) && pool.size > 1) nextCard();
    } finally {
      savingMastered = false;
      drawCard();
    }
  };
  for (const [id, step] of [['quizSmaller', -4], ['quizLarger', 4]]) {
    $(id).onclick = () => { size = Math.max(20, Math.min(80, size + step)); drawCard(); persist(); };
  }
  return {show, snapshot, restore, prepareMerge};
}
