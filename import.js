const normalize = s => String(s ?? '').normalize('NFKC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').toLowerCase();
function csvRows(input){
  const text=input.replace(/^\uFEFF/,'');
  const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted && text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(!quoted && c===delimiter){row.push(field);field=''}
    else if(!quoted && (c==='\r'||c==='\n')){row.push(field);rows.push(row);row=[];field='';if(c==='\r'&&text[i+1]==='\n')i++}
    else field+=c;
  }
  if(quoted)throw Error('CSV 引号未闭合');
  row.push(field);rows.push(row);return rows;
}
function pairsFrom(rows,sheetName=''){
  const englishHeader=/^(?:英文|英语)(?:部分|列|词条|单词|词汇|短语|(?:固定)?搭配|表达)?$|^english(?:words?|terms?|phrases?|collocations?)?$/;
  const termHeader=/^(单词|词汇|词条|短语|(?:固定)?搭配|单词[/／]短语|words?|terms?|phrases?|collocations?)$/;
  const meaningHeader=/^(中文.*|汉语.*|释义|翻译|含义|意思|解释|meanings?|translations?|definitions?|chinese)$/;
  const metadataHeader=/^(序号|编号|备注|词性|首字母|id|notes?|pos)$/;
  let start=0, englishCol=0, meaningCol=1, unmatchedHeader=null;
  const sample=rows.find(row=>row.some(cell=>String(cell??'').trim()));
  if(sample && /^\d+$/.test(String(sample[0]).trim())){englishCol=1;meaningCol=2}
  for(let i=0;i<Math.min(20,rows.length);i++){
    const header=rows[i].map(cell=>normalize(cell).replace(/\s/g,''));
    const zh=header.findIndex(cell=>meaningHeader.test(cell));
    if(zh<0)continue;
    let en=header.findIndex(cell=>englishHeader.test(cell));
    if(en<0)en=header.findIndex(cell=>termHeader.test(cell));
    if(en<0){
      if(!unmatchedHeader && header.some(cell=>metadataHeader.test(cell)))unmatchedHeader=rows[i];
      continue;
    }
    start=i+1;englishCol=en;meaningCol=zh;break;
  }
  if(!start && unmatchedHeader){
    const where=sheetName?'工作表「'+sheetName+'」':'';
    throw Error(where+'未识别英文列。当前表头：'+unmatchedHeader.filter(Boolean).join('、')+'。英文词条列可命名为“英文”或“英文搭配”。');
  }
  return rows.slice(start)
    .map(row=>[String(row[englishCol]??'').trim(),String(row[meaningCol]??'').trim()])
    .filter(([english,meaning])=>/[a-z]/.test(normalize(english))&&meaning);
}
async function readLists(file){
  const stem=file.name.replace(/\.[^.]+$/,'');
  if(/\.csv$/i.test(file.name))return [{sheet:'',name:stem,pairs:pairsFrom(csvRows(await file.text()))}];
  if(!/\.xlsx$/i.test(file.name))throw Error('请选择 .xlsx 或 .csv 文件');
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  async function xml(path){const entry=zip.file(path);if(!entry)throw Error('工作簿缺少必要内容');const doc=new DOMParser().parseFromString(await entry.async('string'),'application/xml');if(doc.querySelector('parsererror'))throw Error('工作簿格式有误');return doc}
  const nodes=(d,tag)=>Array.from(d.getElementsByTagNameNS('*',tag));
  const txt=el=>nodes(el,'t').map(n=>n.textContent).join('');
  const rels=await xml('xl/_rels/workbook.xml.rels'),book=await xml('xl/workbook.xml');
  const paths=new Map(nodes(rels,'Relationship').map(n=>[n.getAttribute('Id'),new URL(n.getAttribute('Target'),'https://package.invalid/xl/').pathname.slice(1)]));
  const sst=zip.file('xl/sharedStrings.xml')?nodes(await xml('xl/sharedStrings.xml'),'si').map(txt):[];
  const result=[];
  for(const sheet of nodes(book,'sheet')){
    const path=paths.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'));
    if(!path||!path.includes('worksheets/'))continue;
    const doc=await xml(path),rows=nodes(doc,'row').map(row=>{
      const cols=[];for(const cell of nodes(row,'c')){
        const col=(cell.getAttribute('r')||'').match(/^[A-Z]+/i)?.[0];
        const idx=col?[...col].reduce((v,s)=>v*26+s.toUpperCase().charCodeAt(0)-64,0)-1:cols.length;
        const type=cell.getAttribute('t'),v=nodes(cell,'v')[0]?.textContent??'';
        cols[idx]=type==='s'?sst[Number(v)]:(type==='inlineStr'?txt(cell):v);
      }return cols;
    });
    const title=sheet.getAttribute('name');result.push({sheet:title,name:stem+' · '+title,pairs:pairsFrom(rows,title)});
  }
  return result;
}
