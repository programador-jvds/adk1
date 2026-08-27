import { FIREBASE_CONFIG, DEFAULT_COMPANY_ID } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getFirestore, doc, collection, onSnapshot, query, where, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const COMPANY_ID = document.documentElement.dataset.company || DEFAULT_COMPANY_ID;
const PAGE = (()=>{
  const n = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return n.replace(/\.html?$/,'').replace(/\(.*?\)$/,'') || 'index';
})();
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const company = (...parts)=>['empresas',COMPANY_ID,...parts];
const escapeHTML=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

window.KleimpaulCMS = {db, companyId:COMPANY_ID, page:PAGE, connected:false};
let cachedOverrides=[];
let searchCatalogPromise=null;

const mediaCache=new Map();
function mediaId(value){const m=String(value||'').match(/^media:([A-Za-z0-9_-]+)$/);return m?m[1]:null;}
async function resolveMedia(value){
  const id=mediaId(value); if(!id) return value;
  if(mediaCache.has(id)) return mediaCache.get(id);
  try{const snap=await getDoc(doc(db,...company('media',id)));const data=snap.exists()?snap.data():null;const out=data&&(data.public===true)?(data.dataUrl||data.url||''):'';mediaCache.set(id,out||'imagens/logo.png');return mediaCache.get(id)}catch{ return 'imagens/logo.png'; }
}
async function resolveRowsImages(rows){return await Promise.all(rows.map(async x=>({...x,image:x.image?await resolveMedia(x.image):x.image})));}

document.addEventListener('error',(event)=>{
  const img=event.target;
  if(img?.tagName==='IMG' && !img.dataset.cmsFallback){ img.dataset.cmsFallback='1'; img.src='imagens/logo.png'; }
},true);

function setConnected(ok){
  window.KleimpaulCMS.connected=ok;
  document.documentElement.dataset.firebase=ok?'online':'offline';
}
function money(v){
  if(v===null||v===undefined||v==='') return '';
  return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function normalizeWhatsapp(value){
  return String(value||'').replace(/\D/g,'');
}
async function applyGlobalSettings(s={}){
  const root=document.documentElement;
  if(s.accent) root.style.setProperty('--cms-accent',s.accent), root.style.setProperty('--orange',s.accent);
  if(s.accent2) root.style.setProperty('--cms-accent-2',s.accent2), root.style.setProperty('--orange-light',s.accent2);
  if(s.radius) root.style.setProperty('--cms-radius',`${Number(s.radius)}px`);
  if(s.siteTitle) document.title=s.siteTitle;
  if(s.companyName){
    document.querySelectorAll('.logo-text strong,.footer-wrapper h3').forEach(el=>{ if(el) el.textContent=s.companyName; });
  }
  if(s.logoUrl){ const logo=await resolveMedia(s.logoUrl); document.querySelectorAll('.logo img').forEach(img=>img.src=logo); }
  if(s.whatsapp){
    const phone=normalizeWhatsapp(s.whatsapp);
    document.querySelectorAll('a[href*="wa.me/"]').forEach(a=>{
      try{const old=new URL(a.href); const text=old.searchParams.get('text'); a.href=`https://wa.me/${phone}${text?'?text='+encodeURIComponent(text):''}`;}catch{}
    });
    let floating=document.querySelector('.cms-floating-contact');
    if(!floating){ floating=document.createElement('a'); floating.className='cms-floating-contact'; floating.target='_blank'; floating.rel='noopener'; floating.title='Falar no WhatsApp'; floating.setAttribute('aria-label','Falar no WhatsApp'); floating.innerHTML='<i class="fa-brands fa-whatsapp"></i>'; document.body.appendChild(floating); }
    floating.href=`https://wa.me/${phone}`;
  }
  if(s.instagram){ document.querySelectorAll('a[href*="instagram.com"]').forEach(a=>a.href=s.instagram); }
}
function safeSelector(sel){ try{return [...document.querySelectorAll(sel)]}catch{return []} }
const overrideStyleMap=new Map();
function cssUrlValue(v){return String(v||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,'');}
function backgroundSizeValue(v){return v==='fill'?'100% 100%':v;}
function backgroundImageValue(o,value){const u=cssUrlValue(value);return o.backgroundTemplate&&o.backgroundTemplate.includes('__CMS_IMAGE__')?o.backgroundTemplate.replace('__CMS_IMAGE__',u):`url("${u}")`;}
function setOverrideRule(o,css){const id=`cms-override-${String(o.id||Math.random()).replace(/[^a-zA-Z0-9_-]/g,'')}`;let style=document.getElementById(id);if(!style){style=document.createElement('style');style.id=id;style.dataset.cmsOverride=o.id||'';document.head.appendChild(style)}style.textContent=css;overrideStyleMap.set(o.id,id);}
async function applyOverride(o){
  if(!o||o.enabled===false||!o.selector) return;
  const mode=o.mode||'text'; const pseudo=/::(?:before|after)$/.test(o.selector);
  if(pseudo){
    if(mode==='background'){
      const value=await resolveMedia(o.value??'');const extra=[o.fit?`background-size:${backgroundSizeValue(o.fit)} !important;`:'',o.position?`background-position:${o.position} !important;`:''].join('');
      setOverrideRule(o,`${o.selector}{background-image:${backgroundImageValue(o,value)} !important;${extra}}`);return;
    }
    if(mode==='style'&&o.attribute){setOverrideRule(o,`${o.selector}{${o.attribute}:${o.value??''} !important;}`);return;}
  }
  for(const el of safeSelector(o.selector)){
    if(mode==='text') el.textContent=o.value??'';
    else if(mode==='html') el.innerHTML=o.value??'';
    else if(mode==='src' && 'src' in el) el.src=await resolveMedia(o.value??'');
    else if(mode==='background'){const value=await resolveMedia(o.value??'');el.style.setProperty('background-image',backgroundImageValue(o,value),'important');}
    else if(mode==='href' && 'href' in el) el.href=o.value??'';
    else if(mode==='placeholder' && 'placeholder' in el) el.placeholder=o.value??'';
    else if(mode==='attribute' && o.attribute) el.setAttribute(o.attribute,o.value??'');
    else if(mode==='style' && o.attribute) el.style.setProperty(o.attribute,o.value??'');
    else if(mode==='class') el.classList.toggle(String(o.value||o.attribute),o.active!==false);
    if(o.alt && el.tagName==='IMG') el.alt=o.alt;
    if(o.fit){if(el.tagName==='IMG')el.style.setProperty('object-fit',o.fit,'important');else el.style.setProperty('background-size',backgroundSizeValue(o.fit),'important');}
    if(o.position){if(el.tagName==='IMG')el.style.setProperty('object-position',o.position,'important');else el.style.setProperty('background-position',o.position,'important');}
    if(o.title) el.setAttribute('title',o.title);
  }
}
function listenSettings(){
  onSnapshot(doc(db,...company('site_settings','config')),(snap)=>{setConnected(true); if(snap.exists()) applyGlobalSettings(snap.data())},()=>setConnected(false));
}
function applyCachedOverrides(){ cachedOverrides.forEach(applyOverride); }
function listenOverrides(){
  const q=query(collection(db,...company('site_overrides')),where('page','in',[PAGE,'*']));
  onSnapshot(q,(snap)=>{
    setConnected(true);
    const next=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.enabled!==false).sort((a,b)=>(a.priority||0)-(b.priority||0));
    const nextIds=new Set(next.map(x=>x.id));document.querySelectorAll('style[data-cms-override]').forEach(s=>{if(!nextIds.has(s.dataset.cmsOverride))s.remove()});cachedOverrides=next;
    applyCachedOverrides();
  },()=>setConnected(false));
}
function ensureHighlightsContainer(){
  let section=document.querySelector('[data-firestore-highlights]');
  if(section) return section;
  if(PAGE!=='index') return null;
  section=document.createElement('section');section.className='cms-highlights';section.dataset.firestoreHighlights='';
  section.innerHTML='<div class="container"><div class="section-title"><span>EM DESTAQUE</span><h2>Ofertas e novidades</h2><p>Seleções, novidades e oportunidades para você.</p></div><div class="cms-highlights-grid" data-cms-highlight-grid></div></div>';
  const anchor=document.querySelector('#produtos');
  if(anchor) anchor.parentNode.insertBefore(section,anchor); else document.body.appendChild(section);
  return section;
}
function listenHighlights(){
  if(PAGE!=='index') return;
  onSnapshot(collection(db,...company('highlights')),async(snap)=>{
    const section=ensureHighlightsContainer(); if(!section)return;
    let rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
    rows=await resolveRowsImages(rows);
    const grid=section.querySelector('[data-cms-highlight-grid]');
    if(!rows.length){section.style.display='none';return} section.style.display='';
    grid.innerHTML=rows.map(x=>`<a class="cms-highlight" data-highlight-id="${escapeHTML(x.id)}" href="${escapeHTML(x.link||'#')}" ${/^https?:/i.test(x.link||'')?'target="_blank" rel="noopener"':''}>
      ${x.image?`<img src="${escapeHTML(x.image)}" alt="${escapeHTML(x.title||'Destaque')}" loading="lazy" decoding="async">`:''}
      <div class="cms-highlight-content">${x.badge?`<span class="cms-highlight-badge">${escapeHTML(x.badge)}</span>`:''}<h3>${escapeHTML(x.title||'Destaque')}</h3>${x.subtitle?`<p>${escapeHTML(x.subtitle)}</p>`:''}</div>
    </a>`).join('');
    window.dispatchEvent(new CustomEvent('kleimpaul:highlights',{detail:{rows}}));
    setTimeout(applyCachedOverrides,0);
  });
}
function ensureCatalogSection(){
  let section=document.querySelector('[data-firestore-catalog]');
  if(section)return section;
  section=document.createElement('section');section.className='cms-catalog';section.dataset.firestoreCatalog='';
  section.innerHTML=`<div class="container"><div class="cms-catalog-header"><div><h2>Catálogo atualizado</h2><p>Confira opções, especificações e detalhes da categoria.</p></div></div><div class="cms-catalog-grid" data-cms-catalog-grid></div></div>`;
  const hero=document.querySelector('.hero-product,.hero');
  const assist=document.querySelector('.cms-category-assist');
  if(assist && assist.parentNode) assist.insertAdjacentElement('afterend',section);
  else if(hero && hero.parentNode) hero.insertAdjacentElement('afterend',section);
  else document.body.appendChild(section);
  return section;
}
function specArray(x){
  if(Array.isArray(x.specs)) return x.specs;
  if(Array.isArray(x.info)) return x.info.map(i=>({label:i.label,value:i.value}));
  return [];
}
function renderCatalogRows(rows){
  if(PAGE==='motosserras' && typeof window.kleimpaulSetMotosserras==='function'){
    window.kleimpaulSetMotosserras(rows.map((x,i)=>({id:x.slug||x.id||i+1,name:x.name||x.title||'Produto',price:Number(x.price||0),power:Number(x.power||0),image:x.image||'imagens/logo.png',info:specArray(x)})));
    window.dispatchEvent(new CustomEvent('kleimpaul:catalog',{detail:{category:PAGE,rows}}));
    setTimeout(applyCachedOverrides,0);
    return;
  }
  const section=ensureCatalogSection(); const grid=section.querySelector('[data-cms-catalog-grid]');
  if(!rows.length){section.style.display='none';window.dispatchEvent(new CustomEvent('kleimpaul:catalog',{detail:{category:PAGE,rows:[]}}));return} section.style.display='';
  grid.innerHTML=rows.map(x=>{
    const specs=specArray(x);
    return `<article class="cms-catalog-card" data-catalog-id="${escapeHTML(x.id)}">${x.image?`<img src="${escapeHTML(x.image)}" alt="${escapeHTML(x.name||'Produto')}" loading="lazy" decoding="async">`:''}<div class="cms-catalog-body">${x.badge?`<span class="cms-catalog-tag">${escapeHTML(x.badge)}</span>`:''}<h3>${escapeHTML(x.name||'Produto')}</h3>${x.description?`<p>${escapeHTML(x.description)}</p>`:''}${x.price?`<strong class="cms-price">${money(x.price)}</strong>`:''}${specs.length?`<div class="cms-specs">${specs.map(s=>`<span>${escapeHTML(s.label)}: ${escapeHTML(s.value)}</span>`).join('')}</div>`:''}</div></article>`;
  }).join('');
  window.dispatchEvent(new CustomEvent('kleimpaul:catalog',{detail:{category:PAGE,rows}}));
  setTimeout(applyCachedOverrides,0);
}
function listenCatalog(){
  if(PAGE==='index') return;
  const q=query(collection(db,...company('catalog_items')),where('category','==',PAGE));
  onSnapshot(q,async(snap)=>{
    let rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
    rows=await resolveRowsImages(rows);
    renderCatalogRows(rows);
  });
}
async function getSearchCatalog(){
  if(!searchCatalogPromise){
    searchCatalogPromise=getDocs(collection(db,...company('catalog_items'))).then(async snap=>{
      let rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false);
      rows=await resolveRowsImages(rows);
      return rows;
    }).catch(()=>[]);
  }
  return searchCatalogPromise;
}
window.KleimpaulCMS.getSearchCatalog=getSearchCatalog;
window.addEventListener('kleimpaul:ui-ready',applyCachedOverrides);
listenSettings();listenOverrides();listenHighlights();listenCatalog();
