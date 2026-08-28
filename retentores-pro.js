(()=>{
const $=id=>document.getElementById(id);let officialRows=[],firestoreRows=[],rows=[],catalogMeta={};
const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/,/g,'.');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=(x,...keys)=>{for(const k of keys)if(x?.[k]!==undefined&&x[k]!==null&&String(x[k]).trim()!=='')return x[k];return ''};
function shaped(x){const specs=Object.fromEntries((x.specs||x.info||[]).map(a=>[norm(a.label),a.value]));const sv=(...names)=>{for(const n of names){const k=Object.keys(specs).find(k=>k.includes(norm(n)));if(k)return specs[k]}return ''};return {id:x.id||'',sourceKey:x.sourceKey||'',active:x.active!==false,saboCode:val(x,'saboCode','sabo')||sv('código sabó','sabo'),arcaCode:val(x,'arcaCode','arca')||sv('código arca','arca'),shaft:val(x,'shaft','eixo')||sv('eixo'),housing:val(x,'housing','alojamento','aloj')||sv('alojamento','aloj'),housing2:val(x,'housing2','alojamento2')||sv('alojamento 2'),height:val(x,'height','altura')||sv('altura'),height2:val(x,'height2','altura2')||sv('altura 2'),orientation:val(x,'orientation','orientacao')||sv('orientação','orientacao'),type:val(x,'retType','tipo')||sv('tipo'),line:val(x,'retLine','linha')||sv('linha'),material:val(x,'material'),montadora:val(x,'montadora'),original:val(x,'original'),corteco:val(x,'corteco'),aplicacao:val(x,'aplicacao'),modelo:val(x,'modelo'),lancamento:val(x,'lancamento'),officialSource:val(x,'officialSource')};}
function mergeRows(){const map=new Map();for(const r of officialRows.map(shaped)){const key=r.sourceKey||`o:${norm(r.saboCode)}|${norm(r.arcaCode)}|${norm(r.shaft)}|${norm(r.housing)}|${norm(r.height)}`;map.set(key,r)}for(const f of firestoreRows.map(shaped)){let key=f.sourceKey;if(!key){const match=[...map.entries()].find(([,r])=>norm(r.saboCode)===norm(f.saboCode)&&norm(r.arcaCode)===norm(f.arcaCode)&&norm(r.shaft)===norm(f.shaft)&&norm(r.housing)===norm(f.housing));if(match)key=match[0];else key=`f:${f.id||Math.random()}`;}const old=map.get(key)||{};map.set(key,{...old,...f,sourceKey:key})}rows=[...map.values()].filter(x=>x.active!==false&&(x.saboCode||x.arcaCode));render();}
function sameMeasure(value,query){if(!query)return true;const a=norm(value).replace(/[^0-9.]/g,''),b=norm(query).replace(/[^0-9.]/g,'');return !b||a.includes(b)}
function filtered(){const q=norm($('retBusca')?.value),sabo=norm($('retSabo')?.value),arca=norm($('retArca')?.value),e=$('retEixo')?.value,a=$('retAloj')?.value,h=$('retAltura')?.value,o=norm($('retOrient')?.value);return rows.filter(r=>{const hay=norm([r.saboCode,r.arcaCode,r.shaft,r.housing,r.housing2,r.height,r.height2,r.orientation,r.type,r.line,r.material,r.montadora,r.original,r.corteco,r.aplicacao,r.modelo].join(' '));return(!q||hay.includes(q))&&(!sabo||norm(r.saboCode).includes(sabo))&&(!arca||norm(r.arcaCode).includes(arca))&&sameMeasure(r.shaft,e)&&sameMeasure(r.housing,a)&&sameMeasure(r.height,h)&&(!o||norm(r.orientation).includes(o))})}
function render(){const list=filtered();if($('retTotal'))$('retTotal').textContent=rows.length;if($('retResultado'))$('retResultado').textContent=rows.length?`${list.length} de ${rows.length} referências encontradas`:'Catálogo técnico carregando…';if($('retCatalogMeta'))$('retCatalogMeta').textContent='Catálogo técnico Sabó × ARCA';if($('retRows'))$('retRows').innerHTML=list.length?list.slice(0,1000).map(r=>`<tr><td class="ret-code-sabo">${esc(r.saboCode||'-')}</td><td class="ret-code-arca">${esc(r.arcaCode||'-')}</td><td class="ret-measure">${esc(r.shaft||'-')}</td><td class="ret-measure">${esc(r.housing||'-')}</td><td class="ret-measure">${esc(r.height||'-')}</td><td>${r.orientation?`<span class="ret-orientation">${esc(r.orientation)}</span>`:'-'}</td><td>${esc(r.type||'-')}</td></tr>`).join('')+(list.length>1000?`<tr><td colspan="7" class="ret-empty">Mostrando 1.000 de ${list.length}. Refine a pesquisa para localizar mais rápido.</td></tr>`:''):'<tr><td colspan="7" class="ret-empty">Nenhum retentor encontrado com esses filtros.</td></tr>'}
function reset(){['retBusca','retSabo','retArca','retEixo','retAloj','retAltura'].forEach(id=>{if($(id))$(id).value=''});if($('retOrient'))$('retOrient').value='';render()}
const MIN_FULL_CATALOG=650;
const CATALOG_SOURCES=[
  ()=>`data/retentores-sabo-arca.json?v=${Date.now()}`,
  ()=>`https://raw.githubusercontent.com/programador-jvds/adk1/main/data/retentores-sabo-arca.json?v=${Date.now()}`,
  ()=>`https://raw.githubusercontent.com/programador-jvds/adk1/master/data/retentores-sabo-arca.json?v=${Date.now()}`
];
let retryTimer=null,retryCount=0;
async function fetchCatalog(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d||!Array.isArray(d.items))throw new Error('formato inválido');return d;}
async function loadOfficial(){
  let best=catalogMeta&&Array.isArray(catalogMeta.items)?catalogMeta:null;
  for(const makeUrl of CATALOG_SOURCES){
    try{const d=await fetchCatalog(makeUrl());if(!best||Number(d.count||d.items.length)>Number(best.count||best.items?.length||0))best=d;if(Number(d.count||d.items.length)>=MIN_FULL_CATALOG&&!d.bootstrap)break;}catch(e){console.warn('Catálogo alternativo indisponível',e)}
  }
  if(best){catalogMeta=best;officialRows=best.items||[];mergeRows();}
  else mergeRows();
  const count=Number(best?.count||best?.items?.length||0);
  if(count<MIN_FULL_CATALOG&&retryCount<30){clearTimeout(retryTimer);retryCount++;retryTimer=setTimeout(loadOfficial,retryCount<10?20000:60000);}
}
['retBusca','retSabo','retArca','retEixo','retAloj','retAltura','retOrient'].forEach(id=>$(id)?.addEventListener('input',render));$('retReset')?.addEventListener('click',reset);$('retLimparBusca')?.addEventListener('click',()=>{if($('retBusca'))$('retBusca').value='';render();$('retBusca')?.focus()});
window.addEventListener('kleimpaul:catalog',e=>{if(e.detail?.category!=='retentores')return;firestoreRows=e.detail.rows||[];mergeRows()});
window.KleimpaulRetentores={reload:loadOfficial,getRows:()=>rows,getOfficial:()=>officialRows};loadOfficial();
})();
