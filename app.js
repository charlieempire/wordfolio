const $=id=>document.getElementById(id);
const key='ciye.wordfolio.v1', baseFile='2014年考研英语一完形填空词汇及固定搭配_精简版.xlsx';
const listId=(file,sheet)=>JSON.stringify([normalize(file),normalize(sheet)]);
function initial(){
  return {version:1,size:19,easy:seed.simple.map(r=>normalize(r[0])),mastered:[],lists:[
    {id:listId(baseFile,'单词'),name:'2014 完形 · 单词',rows:[...seed.words,...seed.simple]},
    {id:listId(baseFile,'固定搭配'),name:'2014 完形 · 固定搭配',rows:seed.phrases}
  ]};
}
const library=createLibraryStore(key,initial),viewKey='ciye.wordfolio.view.v1';
const updates=typeof BroadcastChannel==='function'?new BroadcastChannel('ciye.wordfolio.changes'):null;
let state=initial(),mode='study',source='*',selected=new Set(),shown=[],noticeTimer,importing=false;
let ready=false,viewTimer,viewWarning=false;
if('scrollRestoration' in history)history.scrollRestoration='manual';
const collator=new Intl.Collator('en',{sensitivity:'base',ignorePunctuation:true});
const quizMode=createQuiz();
function toast(message){clearTimeout(noticeTimer);$('toast').textContent=message;$('toast').hidden=false;noticeTimer=setTimeout(()=>{$('toast').hidden=true},3700)}
async function save(change){
  try{state=await library.update(change);updates?.postMessage('saved');return true}
  catch{toast('词库未能保存，请检查浏览器存储空间');return false}
}
function rememberView(){
  if(!ready)return;
  clearTimeout(viewTimer);
  try{localStorage.setItem(viewKey,JSON.stringify({mode,source,query:$('query').value,selected:[...selected],scrollY:scrollY}))}
  catch{if(!viewWarning){viewWarning=true;toast('浏览位置未能保存，请检查浏览器存储')}}
}
function restoreView(){
  let view;
  try{view=JSON.parse(localStorage.getItem(viewKey))}catch{}
  if(!view)return 0;
  mode=['easy','mastered','quiz'].includes(view.mode)?view.mode:'study';
  source=state.lists.some(list=>list.id===view.source)?view.source:'*';
  $('query').value=typeof view.query==='string'?view.query:'';
  selected=new Set(Array.isArray(view.selected)?view.selected:[]);
  return Number.isFinite(view.scrollY)?Math.max(0,view.scrollY):0;
}
function element(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#'+name);svg.setAttribute('aria-hidden','true');svg.append(use);return svg}
function indexRows(lists){
  const entries=new Map();for(const l of lists)for(const row of l.rows){const k=normalize(row[0]);if(!entries.has(k))entries.set(k,row)}
  return entries;
}
function chooseSource(id){source=id;selected.clear();$('query').value='';render();rememberView()}
const categoryTitles={study:'学习词表',easy:'简单词表',mastered:'已会词表'};
function render(){
  const simple=new Set(state.easy);
  const mastered=new Set((state.mastered||[]).filter(key=>!simple.has(key)));
  const matches=k=>mode==='easy'?simple.has(k):mode==='mastered'?mastered.has(k):!simple.has(k)&&!mastered.has(k);
  const entries=indexRows(state.lists);
  const studyCount=entries.size-simple.size-mastered.size;
  $('studyCount').textContent=studyCount;$('easyCount').textContent=simple.size;$('masteredCount').textContent=mastered.size;$('listCount').textContent=state.lists.length;
  for(const tab of ['study','easy','mastered','quiz']){$(tab).classList.toggle('active',tab===mode);$(tab).setAttribute('aria-pressed',tab===mode)}
  const testing=mode==='quiz';
  $('listWorkspace').hidden=testing;
  document.querySelector('.hero').hidden=testing;
  $('quizWorkspace').hidden=!testing;
  if(testing){quizMode.show(state.lists,simple,mastered,entries);return}
  const sidebar=$('sources');sidebar.replaceChildren();
  function sourceButton(id,title,count,symbol,cls){
    const b=element('button','source '+cls+(source===id?' active':''));b.dataset.sourceId=id;b.setAttribute('aria-pressed',source===id);
    const badge=element('span','sourceicon');badge.append(icon(symbol));b.append(badge,element('span','name',title),element('span','srcnum',count));b.onclick=()=>chooseSource(id);sidebar.append(b);
  }
  sourceButton('*','全部词汇',{study:studyCount,easy:simple.size,mastered:mastered.size}[mode],'grid','all');
  sidebar.append(element('p','sourcesub','已导入词表'));
  state.lists.forEach((l,i)=>sourceButton(l.id,l.name,l.rows.filter(r=>matches(normalize(r[0]))).length,'file',i%2?'alt':''));
  const list=state.lists.find(l=>l.id===source);
  $('listTitle').textContent=list?list.name:mode==='study'?'全部词汇':categoryTitles[mode];
  const query=normalize($('query').value);
  shown=[...(list?indexRows([list]):entries)].filter(([k,r])=>matches(k)&&(!query||k.includes(query)||normalize(r[1]).includes(query))).sort((a,b)=>collator.compare(a[0],b[0]));
  $('total').textContent=shown.length+' 词条';$('words').replaceChildren();
  const visible=new Set(shown.map(([k])=>k));
  for(const k of selected)if(!visible.has(k))selected.delete(k);
  const grid=document.createDocumentFragment();
  let initial='',group;
  for(const [k,[en,zh]] of shown){
    const first=k.match(/[a-z]/i)?.[0].toUpperCase()||'#';
    if(first!==initial){
      initial=first;
      group=element('section','word-group');
      group.setAttribute('aria-label',first+' 词条');
      const heading=element('div','letter');
      heading.append(element('span','',first));
      group.append(heading);
      grid.append(group);
    }
    const label=element('label','entry'),box=element('input');box.type='checkbox';box.value=k;box.checked=selected.has(k);box.setAttribute('aria-label','选择 '+en);
    box.onchange=()=>{if(box.checked)selected.add(k);else selected.delete(k);updateSelection();rememberView()};
    const pair=element('span');pair.append(element('strong','',en),element('small','',zh));label.append(box,pair);group.append(label);
  }
  $('words').append(grid);
  $('empty').hidden=shown.length>0;$('empty').textContent=query?'没有找到匹配的词条':{study:'这张词表中没有待学词条',easy:'这张词表还没有简单词',mastered:'这张词表还没有已会词'}[mode];
  document.documentElement.style.setProperty('--word',state.size+'px');$('smaller').disabled=state.size<=15;$('larger').disabled=state.size>=29;
  updateSelection();
}
function updateSelection(){
  const count=selected.size;$('all').disabled=!shown.length;$('all').checked=shown.length>0&&count===shown.length;$('all').indeterminate=count>0&&count<shown.length;
  const suffix=count?'（'+count+'）':'';
  $('move').textContent=(mode==='easy'?'移回学习词表':'移入简单词表')+suffix;
  $('moveMastered').textContent=(mode==='mastered'?'移回学习词表':'移入已会词表')+suffix;
  $('move').disabled=$('moveMastered').disabled=count===0;
}
for(const tab of ['study','easy','mastered'])$(tab).onclick=()=>{mode=tab;chooseSource('*')};
$('quiz').onclick=()=>{mode='quiz';render();rememberView()};
$('all').onchange=()=>{selected=$('all').checked?new Set(shown.map(([k])=>k)):new Set();$('words').querySelectorAll('input').forEach(i=>i.checked=selected.has(i.value));updateSelection();rememberView()};
async function moveSelected(destination){
  const words=[...selected];
  $('move').disabled=$('moveMastered').disabled=true;
  const saved=await save(data=>{
    const simple=new Set(data.easy),mastered=new Set(data.mastered);
    for(const word of words){
      simple.delete(word);mastered.delete(word);
      if(destination==='easy')simple.add(word);
      if(destination==='mastered')mastered.add(word);
    }
    data.easy=[...simple];data.mastered=[...mastered];
  });
  if(saved){for(const word of words)selected.delete(word);render();rememberView();toast('已将 '+words.length+' 个词条移入'+categoryTitles[destination])}
  else updateSelection();
}
$('move').onclick=()=>moveSelected(mode==='easy'?'study':'easy');
$('moveMastered').onclick=()=>moveSelected(mode==='mastered'?'study':'mastered');
$('query').oninput=()=>{selected.clear();render();rememberView()};
for(const [button,inc] of [['larger',2],['smaller',-2]])$(button).onclick=async()=>{if(await save(data=>{data.size=Math.max(15,Math.min(29,data.size+inc))})){render();rememberView()}};
async function refreshLibrary(){
  if(!ready)return;
  try{state=await library.read();render()}catch{toast('词库暂时无法读取')}
}
if(updates)updates.onmessage=refreshLibrary;
window.addEventListener('storage',e=>{if(e.key===key)refreshLibrary()});
window.addEventListener('scroll',()=>{if(ready){clearTimeout(viewTimer);viewTimer=setTimeout(rememberView,120)}},{passive:true});
window.addEventListener('pagehide',rememberView);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberView();else refreshLibrary()});
const dialog=$('importBox');
$('openImport').onclick=()=>{$('result').textContent='';dialog.showModal()};
$('dismiss').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog&&!importing){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
$('pick').onclick=()=>$('files').click();
async function importFiles(files){
  if(importing||!files.length)return;importing=true;$('pick').disabled=true;$('result').textContent='正在读取…';
  const messages=[];let last=null;
  try{for(const file of files){
    try{const sheets=await readLists(file);let added=0,skipped=0,skippedMastered=0,repeated=0,lastAdded=null;
      if(!sheets.some(s=>s.pairs.length))throw Error('未找到词条，请使用“英文”和“中文释义”两列');
      const saved=await save(data=>{
        const simple=new Set(data.easy),mastered=new Set(data.mastered),knownEnglish=new Set();
        for(const list of data.lists)for(const [english] of list.rows)knownEnglish.add(normalize(english));
        for(const {name,sheet,pairs} of sheets){
          const id=listId(file.name,sheet);let list=data.lists.find(l=>l.id===id);
          for(const [english,meaning] of pairs){
            const k=normalize(english);
            if(simple.has(k)){skipped++;continue}
            if(mastered.has(k)){skippedMastered++;continue}
            if(knownEnglish.has(k)){repeated++;continue}
            if(!list){list={id,name,rows:[]};data.lists.push(list)}
            list.rows.push([english,meaning]);knownEnglish.add(k);added++;lastAdded=id;
          }
        }
      });
      if(!saved)throw Error('无法保存，请检查浏览器存储');
      if(lastAdded)last=lastAdded;
      messages.push(file.name+'：新增 '+added+'，跳过简单词 '+skipped+(skippedMastered?'，跳过已会词 '+skippedMastered:'')+'，跳过重复词 '+repeated+'。');
    }catch(e){messages.push(file.name+'：'+(e.message||'读取失败'))}
  }}finally{importing=false;$('pick').disabled=false;$('files').value='';$('result').textContent=messages.join('\n');if(last){mode='study';chooseSource(last)}else render()}
}
$('files').onchange=e=>importFiles([...e.target.files]);const drop=$('pick');
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');importFiles([...e.dataTransfer.files])};
async function start(){
  const header=document.querySelector('header'),main=document.querySelector('main');
  header.inert=main.inert=true;
  try{
    state=await library.open();
    const top=restoreView();
    render();
    window.scrollTo(0,top);
    ready=true;
    header.inert=main.inert=false;
  }catch{toast('无法打开词库，请允许此网站保存数据后刷新页面')}
}
start();
