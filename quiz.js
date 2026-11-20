function createQuiz() {
  const key = 'ciye.wordfolio.quiz.v1';
  let stored;
  try { stored = JSON.parse(localStorage.getItem(key)); } catch {}
  let scope = Array.isArray(stored?.scope) ? new Set(stored.scope) : null;
  let size = Number.isInteger(stored?.size) ? Math.max(20, Math.min(80, stored.size)) : 44;
  let order = Array.isArray(stored?.order) ? stored.order : [];
  let cursor = Number.isInteger(stored?.cursor) ? stored.cursor : 0;
  let revealed = stored?.revealed === true;
  let includeMastered = stored?.includeMastered === true;
  let pool = new Map(), lists = [], simple = new Set(), mastered = new Map();

  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify({scope: scope === null ? null : [...scope], includeMastered, size, order, cursor, revealed}));
    } catch { toast('检验设置未能保存，请检查浏览器存储'); }
  }
  function shuffleRound(last) {
    const round = [...pool.keys()];
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
  function drawCard() {
    const pair = pool.get(order[cursor]);
    $('quizCount').textContent = pool.size + ' 词条';
    $('quizProgress').textContent = pair ? (cursor % pool.size + 1) + ' / ' + pool.size : '';
    $('quizEnglish').textContent = pair?.[0] || '';
    $('quizEnglish').style.fontSize = size + 'px';
    $('quizMeaning').textContent = pair && revealed ? pair[1] : '';
    $('quizMeaning').hidden = !pair || !revealed;
    $('quizEmpty').hidden = !!pair;
    $('quizEmpty').textContent = scope?.size === 0 && !includeMastered ? '请选择要检验的词表' : '所选词表暂无可检验的词条';
    $('quizReveal').textContent = revealed && pair ? '隐藏翻译' : '显示翻译';
    $('quizReveal').setAttribute('aria-expanded', String(!!pair && revealed));
    $('quizReveal').disabled = !pair;
    $('quizPrev').disabled = !pair || cursor === 0;
    $('quizNext').disabled = pool.size < 2;
    $('quizSmaller').disabled = size <= 20;
    $('quizLarger').disabled = size >= 80;
  }
  function updateScope(forceShuffle = false) {
    const selected = scope === null ? lists : lists.filter(list => scope.has(list.id));
    pool = indexRows(selected);
    for (const k of simple) pool.delete(k);
    for (const [k,pair] of mastered) {
      if (includeMastered) pool.set(k,pair); else pool.delete(k);
    }
    if (forceShuffle || !deckMatchesPool()) {
      order = shuffleRound(); cursor = 0; revealed = false; persist();
    }
    $('quizAll').checked = !!lists.length && selected.length === lists.length;
    $('quizAll').indeterminate = selected.length > 0 && selected.length < lists.length;
    $('quizMastered').checked = includeMastered;
    for (const box of $('quizSources').querySelectorAll('input')) box.checked = scope === null || scope.has(box.value);
    drawCard();
  }
  function show(data, excluded, masteredKeys, entries) {
    lists = data; simple = excluded;
    mastered = new Map();
    for (const k of masteredKeys) if (entries.has(k)) mastered.set(k,entries.get(k));
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
  $('quizReveal').onclick = () => { revealed = !revealed; drawCard(); persist(); };
  $('quizPrev').onclick = () => { cursor--; revealed = false; drawCard(); persist(); };
  $('quizNext').onclick = () => {
    if (cursor === order.length - 1) {
      // Keep the preceding round so Back works across a shuffle.
      order = order.slice(-pool.size).concat(shuffleRound(order[cursor]));
      cursor = pool.size;
    } else cursor++;
    revealed = false; drawCard(); persist();
  };
  for (const [id, step] of [['quizSmaller', -4], ['quizLarger', 4]]) {
    $(id).onclick = () => { size = Math.max(20, Math.min(80, size + step)); drawCard(); persist(); };
  }
  return {show};
}
