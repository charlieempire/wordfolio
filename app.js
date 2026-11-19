const $=id=>document.getElementById(id);
const key='ciye.wordfolio.v1', baseFile='2014年考研英语一完形填空词汇及固定搭配_精简版.xlsx';
const listId=(file,sheet)=>JSON.stringify([normalize(file),normalize(sheet)]);
function initial(){
  return {version:1,size:19,easy:seed.simple.map(r=>normalize(r[0])),lists:[
    {id:listId(baseFile,'单词'),name:'2014 完形 · 单词',rows:[...seed.words,...seed.simple]},
    {id:listId(baseFile,'固定搭配'),name:'2014 完形 · 固定搭配',rows:seed.phrases}
  ]};
}
let state=initial(),storageError=false;
try{const data=JSON.parse(localStorage.getItem(key)||'null');if(data?.version===1&&Array.isArray(data.lists)&&Array.isArray(data.easy))state=data;else localStorage.setItem(key,JSON.stringify(state))}catch{storageError=true}
let mode='study',source='*',selected=new Set(),shown=[],noticeTimer,lastColumns=0,importing=false;
const collator=new Intl.Collator('en',{sensitivity:'base',ignorePunctuation:true});
function toast(message){clearTimeout(noticeTimer);$('toast').textContent=message;$('toast').hidden=false;noticeTimer=setTimeout(()=>{$('toast').hidden=true},3700)}
function save(next){try{localStorage.setItem(key,JSON.stringify(next));state=next;return true}catch{toast('浏览器存储空间不足或不可用，修改未保存');return false}}
function element(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#'+name);svg.setAttribute('aria-hidden','true');svg.append(use);return svg}
function indexRows(lists){
  const entries=new Map();for(const l of lists)for(const row of l.rows){const k=normalize(row[0]);if(!entries.has(k))entries.set(k,row)}
  return entries;
}
function chooseSource(id){source=id;selected.clear();$('query').value='';render()}
function render(){
  const simple=new Set(state.easy),isEasy=mode==='easy',matches=k=>simple.has(k)===isEasy;
  const entries=indexRows(state.lists);
  $('studyCount').textContent=entries.size-simple.size;$('easyCount').textContent=simple.size;$('listCount').textContent=state.lists.length;
  for(const tab of ['study','easy']){$(tab).classList.toggle('active',tab===mode);$(tab).setAttribute('aria-pressed',tab===mode)}
  const sidebar=$('sources');sidebar.replaceChildren();
  function sourceButton(id,title,count,symbol,cls){
    const b=element('button','source '+cls+(source===id?' active':''));b.setAttribute('aria-pressed',source===id);
    const badge=element('span','sourceicon');badge.append(icon(symbol));b.append(badge,element('span','name',title),element('span','srcnum',count));b.onclick=()=>chooseSource(id);sidebar.append(b);
  }
  sourceButton('*','全部词汇',isEasy?simple.size:entries.size-simple.size,'grid','all');
  sidebar.append(element('p','sourcesub','已导入词表'));
  state.lists.forEach((l,i)=>sourceButton(l.id,l.name,l.rows.filter(r=>matches(normalize(r[0]))).length,'file',i%2?'alt':''));
  const list=state.lists.find(l=>l.id===source);
  $('listTitle').textContent=list?list.name:isEasy?'简单词表':'全部词汇';
  const query=normalize($('query').value);
  shown=[...(list?indexRows([list]):entries)].filter(([k,r])=>matches(k)&&(!query||k.includes(query)||normalize(r[1]).includes(query))).sort((a,b)=>collator.compare(a[0],b[0]));
  $('total').textContent=shown.length+' 词条';$('words').replaceChildren();
  const n=columns();lastColumns=n;$('words').style.setProperty('--cols',n);
  const grid=document.createDocumentFragment();
  let initial='';
  for(const [k,[en,zh]] of shown){
    const first=k.match(/[a-z]/i)?.[0].toUpperCase()||'#';
    if(first!==initial){
      initial=first;
      const heading=element('div','letter');
      heading.append(element('span','',first));
      grid.append(heading);
    }
    const label=element('label','entry'),box=element('input');box.type='checkbox';box.value=k;box.checked=selected.has(k);box.setAttribute('aria-label','选择 '+en);
    box.onchange=()=>{if(box.checked)selected.add(k);else selected.delete(k);updateSelection()};
    const pair=element('span');pair.append(element('strong','',en),element('small','',zh));label.append(box,pair);grid.append(label);
  }
  $('words').append(grid);
  $('empty').hidden=shown.length>0;$('empty').textContent=query?'没有找到匹配的词条':isEasy?'这张词表还没有简单词':'这张词表中没有待学词条';
  document.documentElement.style.setProperty('--word',state.size+'px');$('smaller').disabled=state.size<=15;$('larger').disabled=state.size>=29;
  updateSelection();
}
function columns(){const width=$('words').parentElement.clientWidth;return width<335?1:width<710?2:3}
function updateSelection(){
  const count=selected.size;$('all').disabled=!shown.length;$('all').checked=shown.length>0&&count===shown.length;$('all').indeterminate=count>0&&count<shown.length;
  $('move').textContent=(mode==='easy'?'移回学习词表':'移入简单词表')+(count?'（'+count+'）':'');$('move').disabled=count===0;
}
for(const tab of ['study','easy'])$(tab).onclick=()=>{mode=tab;chooseSource('*')};
$('all').onchange=()=>{selected=$('all').checked?new Set(shown.map(([k])=>k)):new Set();$('words').querySelectorAll('input').forEach(i=>i.checked=selected.has(i.value));updateSelection()};
$('move').onclick=()=>{const simple=new Set(state.easy),count=selected.size;for(const k of selected)if(mode==='study')simple.add(k);else simple.delete(k);
  if(save({...state,easy:[...simple]})){selected.clear();render();toast('已将 '+count+' 个词条移入'+(mode==='study'?'简单词表':'学习词表'))}};
$('query').oninput=()=>{selected.clear();render()};
for(const [button,inc] of [['larger',2],['smaller',-2]])$(button).onclick=()=>{if(save({...state,size:Math.max(15,Math.min(29,state.size+inc))}))render()};
window.addEventListener('resize',()=>{if(columns()!==lastColumns)render()});
window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){try{const s=JSON.parse(e.newValue);if(s.version===1){state=s;selected.clear();render()}}catch{}}});
const dialog=$('importBox');
$('openImport').onclick=()=>{$('result').textContent='';dialog.showModal()};
$('dismiss').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog&&!importing){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
$('pick').onclick=()=>$('files').click();
async function importFiles(files){
  if(importing||!files.length)return;importing=true;$('pick').disabled=true;$('result').textContent='正在读取…';
  const messages=[];let last=null;
  try{for(const file of files){
    try{const sheets=await readLists(file),next=structuredClone(state),simple=new Set(next.easy);let added=0,skipped=0,repeated=0,valid=0;
      for(const {name,sheet,pairs} of sheets){
        valid+=pairs.length;const id=listId(file.name,sheet);let list=next.lists.find(l=>l.id===id);const keys=new Set((list?.rows||[]).map(r=>normalize(r[0])));
        for(const pair of pairs){const k=normalize(pair[0]);if(simple.has(k)){skipped++;continue}if(keys.has(k)){repeated++;continue}
          if(!list){list={id,name,rows:[]};next.lists.push(list)}list.rows.push(pair);keys.add(k);added++;last=id;
        }
      }
      if(!valid)throw Error('未找到词条，请使用“英文”和“中文释义”两列');
      if(added&&!save(next))throw Error('无法保存，请检查浏览器存储');
      messages.push(file.name+'：新增 '+added+'，跳过简单词 '+skipped+'，表内重复 '+repeated+'。');
    }catch(e){messages.push(file.name+'：'+(e.message||'读取失败'))}
  }}finally{importing=false;$('pick').disabled=false;$('files').value='';$('result').textContent=messages.join('\n');if(last){mode='study';chooseSource(last)}else render()}
}
$('files').onchange=e=>importFiles([...e.target.files]);const drop=$('pick');
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');importFiles([...e.dataTransfer.files])};
render();if(storageError)toast('浏览器存储不可用，请允许此网站保存数据');
