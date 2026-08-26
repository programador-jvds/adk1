import { FIREBASE_CONFIG, DEFAULT_COMPANY_ID, adminEmail } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, serverTimestamp, writeBatch, query, orderBy, limit, where
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const $ = (id)=>document.getElementById(id);
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const PAGES = ['index','motosserras','correias','retentores','rolamentos','mancais','mangueiras','oleos','pinhao','polias','lavadoras','rocadeiras','sopradores','desenvolvedor'];
const COLLECTIONS = ['site_overrides','highlights','catalog_items','inventory','trash','chat','media','audit'];
const PUBLIC_COLLECTIONS = new Set(['site_overrides','highlights','catalog_items']);
const EXPECTED_USER = 'diva';
const EXPECTED_COMPANY = '1';

let companyId = DEFAULT_COMPANY_ID;
let currentUser = null;
let unsubscribers = [];
const state = { settings:{}, overrides:[], highlights:[], catalog:[], inventory:[], trash:[], chat:[], media:[], audit:[], backups:[] };

function cpath(...parts){ return ['empresas',companyId,...parts]; }
function cref(name){ return collection(db,...cpath(name)); }
function dref(name,id){ return doc(db,...cpath(name,id)); }
function nowISO(){ return new Date().toISOString(); }
function fmtDate(v){
  if(!v) return '-';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR');
}
function money(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function slug(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function toast(message,type='ok'){
  const t=document.createElement('div'); t.className='toast';
  t.style.borderLeftColor=type==='error'?'var(--red)':type==='info'?'var(--blue)':'var(--green)';
  t.textContent=message; document.body.appendChild(t); setTimeout(()=>t.remove(),3600);
}
function setBusy(btn,busy,label){
  if(!btn) return; btn.disabled=busy; btn.classList.toggle('loading',busy);
  if(label){ if(!btn.dataset.old) btn.dataset.old=btn.innerHTML; btn.innerHTML=busy?label:btn.dataset.old; }
}
function countRecords(payload){
  let n=0; Object.values(payload.data||{}).forEach(v=>{ if(Array.isArray(v)) n+=v.length; else if(v&&typeof v==='object') n+=1; }); return n;
}
async function sha256(text){
  const bytes=new TextEncoder().encode(text); const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function downloadBlob(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }

const NAV = [
  ['dashboard','fa-chart-line','Dashboard'],['editor','fa-pen-ruler','Editor do site'],['highlights','fa-star','Destaques'],
  ['catalog','fa-layer-group','Catálogos'],['inventory','fa-boxes-stacked','Estoque'],['media','fa-images','Mídia'],
  ['chat','fa-comments','Chat'],['trash','fa-trash-can','Lixeira'],['backup','fa-cloud-arrow-up','Backup'],
  ['audit','fa-clock-rotate-left','Auditoria'],['settings','fa-gear','Configurações']
];
function renderNav(){
  const desktop=$('nav'), mobile=$('mobileNav');
  const html=NAV.map(([id,icon,label],i)=>`<button data-go="${id}" class="${i===0?'active':''}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`).join('');
  desktop.innerHTML=html; mobile.innerHTML=html;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showSection(b.dataset.go));
}
function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.dataset.section===id));
  document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===id));
  const item=NAV.find(x=>x[0]===id); if(item) $('sectionName').textContent=item[2];
  if(id==='editor') refreshPreview();
}
function populatePages(){
  const options=PAGES.map(p=>`<option value="${p}">${p}.html</option>`).join('');
  $('ovPage').innerHTML=options; $('catCategory').innerHTML=options.replace('<option value="index">index.html</option>','');
  $('catFilter').innerHTML='<option value="">Todas as categorias</option>'+options.replace('<option value="index">index.html</option>','');
  $('ovPage').onchange=refreshPreview; $('previewBtn').onclick=refreshPreview;
}
function refreshPreview(){ const p=$('ovPage').value||'index'; $('previewFrame').src=`${p}.html?preview=${Date.now()}`; }

function expectedEmail(){ return adminEmail(EXPECTED_USER,EXPECTED_COMPANY); }
async function login(){
  const user=$('loginUser').value.trim().toLowerCase(); const pass=$('loginPass').value; const comp=EXPECTED_COMPANY;
  $('loginError').textContent='';
  if(user!==EXPECTED_USER){ $('loginError').textContent='Usuário inválido.'; return; }
  if(!pass){ $('loginError').textContent='Digite a senha.'; return; }
  setBusy($('loginBtn'),true,'Entrando...');
  try{
    companyId=comp; await setPersistence(auth,browserLocalPersistence);
    await signInWithEmailAndPassword(auth,adminEmail(user,comp),pass);
  }catch(e){
    console.error(e); $('loginError').textContent='Acesso não autorizado. Verifique o usuário e a senha.';
  }finally{ setBusy($('loginBtn'),false); }
}
$('loginBtn').onclick=login; $('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')login()}); $('logoutBtn').onclick=()=>signOut(auth);
const passwordToggle=$('passwordToggle'); if(passwordToggle){ passwordToggle.onclick=()=>{ const input=$('loginPass'); const show=input.type==='password'; input.type=show?'text':'password'; passwordToggle.innerHTML=`<i class=\"fa-solid ${show?'fa-eye-slash':'fa-eye'}\"></i>`; }; }

onAuthStateChanged(auth,user=>{
  const valid=user && user.email?.toLowerCase()===expectedEmail();
  if(!valid){
    currentUser=null; $('login').style.display='grid'; $('app').style.display='none';
    unsubscribers.forEach(fn=>fn()); unsubscribers=[]; if(user) signOut(auth); return;
  }
  currentUser=user; companyId=EXPECTED_COMPANY; $('login').style.display='none'; $('app').style.display='block';
  document.querySelectorAll('[data-company]').forEach(x=>x.textContent=companyId); $('userState').textContent='diva • empresa 1';
  bootData();
});

function listen(name,sorter){
  const unsub=onSnapshot(cref(name),snap=>{
    state[name==='site_overrides'?'overrides':name==='catalog_items'?'catalog':name]=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(sorter) state[name==='site_overrides'?'overrides':name==='catalog_items'?'catalog':name].sort(sorter);
    renderAll(); $('fbState').textContent='online';
  },err=>{ console.error(name,err); $('fbState').textContent='erro'; });
  unsubscribers.push(unsub);
}
function bootData(){
  unsubscribers.forEach(fn=>fn()); unsubscribers=[];
  const settingsUnsub=onSnapshot(dref('site_settings','config'),snap=>{ state.settings=snap.exists()?snap.data():{}; fillSettings(); renderAll(); });
  unsubscribers.push(settingsUnsub);
  listen('site_overrides',(a,b)=>(a.priority||0)-(b.priority||0));
  listen('highlights',(a,b)=>(a.order||0)-(b.order||0));
  listen('catalog_items',(a,b)=>String(a.category||'').localeCompare(String(b.category||''))||(a.order||0)-(b.order||0));
  listen('inventory',(a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  listen('trash',(a,b)=>String(b.deletedAtISO||'').localeCompare(String(a.deletedAtISO||'')));
  listen('chat',(a,b)=>(a.createdAtMs||0)-(b.createdAtMs||0));
  listen('media',(a,b)=>String(b.createdAtISO||'').localeCompare(String(a.createdAtISO||'')));
  const aQ=query(cref('audit'),orderBy('createdAtMs','desc'),limit(250));
  unsubscribers.push(onSnapshot(aQ,s=>{state.audit=s.docs.map(d=>({id:d.id,...d.data()}));renderAudit();},console.error));
  const bQ=query(cref('backups'),orderBy('createdAtMs','desc'),limit(100));
  unsubscribers.push(onSnapshot(bQ,s=>{state.backups=s.docs.map(d=>({id:d.id,...d.data()}));renderBackups();},console.error));
  verifyDatabase(false);
}
async function audit(action,target,details={}){
  try{ await addDoc(cref('audit'),{action,target,details,actor:currentUser?.email||'',companyId,createdAt:serverTimestamp(),createdAtMs:Date.now(),createdAtISO:nowISO()}); }catch(e){console.warn('audit',e)}
}

function renderAll(){ renderDashboard(); renderOverrides(); renderHighlights(); renderCatalog(); renderInventory(); renderTrash(); renderChat(); renderMedia(); }
function renderDashboard(){
  const inv=state.inventory; const totalQty=inv.reduce((a,x)=>a+Number(x.qty||0),0); const totalValue=inv.reduce((a,x)=>a+Number(x.qty||0)*Number(x.price||0),0);
  const low=inv.filter(x=>Number(x.qty||0)<=Number(x.minQty??5)).length;
  $('kInventory').textContent=inv.length; $('kValue').textContent=money(totalValue); $('kLow').textContent=low;
  $('kOverrides').textContent=state.overrides.filter(x=>x.enabled!==false).length; $('kHighlights').textContent=state.highlights.filter(x=>x.active!==false).length;
  $('kCatalog').textContent=state.catalog.filter(x=>x.active!==false).length; $('kMedia').textContent=state.media.length; $('kBackup').textContent=state.backups.length;
}
function actionButtons(edit,del){ return `<div class="row-actions"><button class="btn gray sm" onclick="${edit}"><i class="fa-solid fa-pen"></i></button><button class="btn red sm" onclick="${del}"><i class="fa-solid fa-trash"></i></button></div>`; }

// SITE OVERRIDES
function clearOverride(){ ['ovId','ovLabel','ovSelector','ovAttribute','ovValue'].forEach(id=>$(id).value=''); $('ovPriority').value='10'; $('ovEnabled').checked=true; $('ovMode').value='text'; }
$('ovClear').onclick=clearOverride;
$('ovSave').onclick=async()=>{
  const id=$('ovId').value; const data={page:$('ovPage').value,label:$('ovLabel').value.trim(),selector:$('ovSelector').value.trim(),mode:$('ovMode').value,attribute:$('ovAttribute').value.trim(),value:$('ovValue').value,priority:Number($('ovPriority').value||0),enabled:$('ovEnabled').checked,updatedAt:serverTimestamp(),updatedAtISO:nowISO()};
  if(!data.selector){toast('Informe um seletor CSS.','error');return}
  try{ id?await updateDoc(dref('site_overrides',id),data):await addDoc(cref('site_overrides'),data); await audit(id?'override.update':'override.create',data.selector,{page:data.page}); clearOverride(); refreshPreview(); toast('Edição publicada com sucesso.'); }catch(e){console.error(e);toast('Falha ao salvar edição.','error')}
};
window.editOverride=id=>{const x=state.overrides.find(x=>x.id===id);if(!x)return; $('ovId').value=id;$('ovPage').value=x.page||'index';$('ovLabel').value=x.label||'';$('ovSelector').value=x.selector||'';$('ovMode').value=x.mode||'text';$('ovAttribute').value=x.attribute||'';$('ovValue').value=x.value||'';$('ovPriority').value=x.priority||0;$('ovEnabled').checked=x.enabled!==false;refreshPreview();window.scrollTo({top:0,behavior:'smooth'})};
window.delOverride=async id=>{if(!confirm('Excluir esta edição?'))return;await deleteDoc(dref('site_overrides',id));await audit('override.delete',id);toast('Edição excluída.')};
function renderOverrides(){ $('ovRows').innerHTML=state.overrides.map(x=>`<tr><td>${esc(x.page)}</td><td>${esc(x.label||'-')}</td><td><code>${esc(x.selector)}</code></td><td>${esc(x.mode)}</td><td><span class="pill ${x.enabled!==false?'green':'red'}">${x.enabled!==false?'ATIVO':'PAUSADO'}</span></td><td>${actionButtons(`editOverride('${x.id}')`,`delOverride('${x.id}')`)}</td></tr>`).join(''); }

// HIGHLIGHTS
function clearHighlight(){ ['hiId','hiTitle','hiBadge','hiSubtitle','hiImage','hiLink'].forEach(id=>$(id).value=''); $('hiOrder').value='10';$('hiActive').checked=true; }
$('hiClear').onclick=clearHighlight;
$('hiSave').onclick=async()=>{ const id=$('hiId').value; const data={title:$('hiTitle').value.trim(),badge:$('hiBadge').value.trim(),subtitle:$('hiSubtitle').value.trim(),image:$('hiImage').value.trim(),link:$('hiLink').value.trim(),order:Number($('hiOrder').value||0),active:$('hiActive').checked,updatedAt:serverTimestamp(),updatedAtISO:nowISO()}; if(!data.title){toast('Informe o título.','error');return} id?await updateDoc(dref('highlights',id),data):await addDoc(cref('highlights'),data);await audit(id?'highlight.update':'highlight.create',data.title);clearHighlight();toast('Destaque salvo.'); };
window.editHighlight=id=>{const x=state.highlights.find(x=>x.id===id);if(!x)return;$('hiId').value=id;$('hiTitle').value=x.title||'';$('hiBadge').value=x.badge||'';$('hiSubtitle').value=x.subtitle||'';$('hiImage').value=x.image||'';$('hiLink').value=x.link||'';$('hiOrder').value=x.order||0;$('hiActive').checked=x.active!==false};
window.delHighlight=async id=>{if(!confirm('Excluir destaque?'))return;await deleteDoc(dref('highlights',id));await audit('highlight.delete',id)};
function renderHighlights(){ $('hiRows').innerHTML=state.highlights.map(x=>`<tr><td>${x.order||0}</td><td>${esc(x.title)}</td><td>${esc(x.badge||'-')}</td><td><span class="pill ${x.active!==false?'green':'red'}">${x.active!==false?'ATIVO':'OCULTO'}</span></td><td>${actionButtons(`editHighlight('${x.id}')`,`delHighlight('${x.id}')`)}</td></tr>`).join(''); }

// CATALOG
function parseSpecs(text){return String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const i=l.indexOf('=');return i<0?{label:'Info',value:l}:{label:l.slice(0,i).trim(),value:l.slice(i+1).trim()}})}
function specsText(arr){return (arr||[]).map(x=>`${x.label} = ${x.value}`).join('\n')}
function clearCatalog(){['catId','catName','catBadge','catPrice','catPower','catImage','catDescription','catSpecs'].forEach(id=>$(id).value='');$('catOrder').value='10';$('catActive').checked=true;}
$('catClear').onclick=clearCatalog;
$('catSave').onclick=async()=>{const id=$('catId').value;const name=$('catName').value.trim();if(!name){toast('Informe o nome do produto.','error');return}const data={category:$('catCategory').value,name,slug:slug(name),badge:$('catBadge').value.trim(),price:Number($('catPrice').value||0),power:Number($('catPower').value||0),image:$('catImage').value.trim(),description:$('catDescription').value.trim(),specs:parseSpecs($('catSpecs').value),order:Number($('catOrder').value||0),active:$('catActive').checked,updatedAt:serverTimestamp(),updatedAtISO:nowISO()};id?await updateDoc(dref('catalog_items',id),data):await addDoc(cref('catalog_items'),data);await audit(id?'catalog.update':'catalog.create',name,{category:data.category});clearCatalog();toast('Produto salvo no catálogo.');};
window.editCatalog=id=>{const x=state.catalog.find(x=>x.id===id);if(!x)return;$('catId').value=id;$('catCategory').value=x.category||'motosserras';$('catName').value=x.name||'';$('catBadge').value=x.badge||'';$('catPrice').value=x.price||'';$('catPower').value=x.power||'';$('catImage').value=x.image||'';$('catDescription').value=x.description||'';$('catSpecs').value=specsText(x.specs||x.info);$('catOrder').value=x.order||0;$('catActive').checked=x.active!==false};
window.delCatalog=async id=>{if(!confirm('Excluir produto do catálogo?'))return;await deleteDoc(dref('catalog_items',id));await audit('catalog.delete',id)};
$('catFilter').onchange=renderCatalog;
function renderCatalog(){const f=$('catFilter').value;const rows=state.catalog.filter(x=>!f||x.category===f);$('catRows').innerHTML=rows.map(x=>`<tr><td>${esc(x.category)}</td><td>${esc(x.name)}</td><td>${x.price?money(x.price):'-'}</td><td><span class="pill ${x.active!==false?'green':'red'}">${x.active!==false?'ATIVO':'OCULTO'}</span></td><td>${actionButtons(`editCatalog('${x.id}')`,`delCatalog('${x.id}')`)}</td></tr>`).join('');}

// INVENTORY
function clearInventory(){['invId','invName','invCode','invCategory','invQty','invPrice'].forEach(id=>$(id).value='');$('invMin').value='5';}
$('invClear').onclick=clearInventory;
$('invSave').onclick=async()=>{const id=$('invId').value;const data={name:$('invName').value.trim(),code:$('invCode').value.trim(),category:$('invCategory').value.trim(),qty:Number($('invQty').value||0),minQty:Number($('invMin').value||5),price:Number($('invPrice').value||0),updatedAt:serverTimestamp(),updatedAtISO:nowISO()};if(!data.name||!data.code){toast('Nome e SKU são obrigatórios.','error');return}id?await updateDoc(dref('inventory',id),data):await addDoc(cref('inventory'),{...data,createdAt:serverTimestamp(),createdAtISO:nowISO()});await audit(id?'inventory.update':'inventory.create',data.code,{name:data.name});clearInventory();toast('Estoque atualizado.');};
window.editInventory=id=>{const x=state.inventory.find(x=>x.id===id);if(!x)return;$('invId').value=id;$('invName').value=x.name||'';$('invCode').value=x.code||'';$('invCategory').value=x.category||'';$('invQty').value=x.qty||0;$('invMin').value=x.minQty??5;$('invPrice').value=x.price||0};
window.delInventory=async id=>{const x=state.inventory.find(x=>x.id===id);if(!x||!confirm(`Enviar ${x.name} para a lixeira?`))return;const b=writeBatch(db);b.set(dref('trash',id),{...x,originalId:id,deletedAt:serverTimestamp(),deletedAtISO:nowISO()});b.delete(dref('inventory',id));await b.commit();await audit('inventory.trash',x.code,{name:x.name});toast('Item enviado para a lixeira.');};
$('invSearch').oninput=renderInventory;
function renderInventory(){const q=$('invSearch').value.trim().toLowerCase();const rows=state.inventory.filter(x=>!q||[x.name,x.code,x.category].some(v=>String(v||'').toLowerCase().includes(q)));$('invRows').innerHTML=rows.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(x.code)}</td><td>${esc(x.category||'-')}</td><td><span class="pill ${Number(x.qty||0)<=Number(x.minQty??5)?'red':'green'}">${Number(x.qty||0)}</span></td><td>${money(x.price)}</td><td>${actionButtons(`editInventory('${x.id}')`,`delInventory('${x.id}')`)}</td></tr>`).join('');}

// TRASH
window.restoreTrash=async id=>{const x=state.trash.find(x=>x.id===id);if(!x)return;const clean={...x};['id','originalId','deletedAt','deletedAtISO'].forEach(k=>delete clean[k]);const target=x.originalId||id;const b=writeBatch(db);b.set(dref('inventory',target),clean);b.delete(dref('trash',id));await b.commit();await audit('trash.restore',target);toast('Item restaurado.');};
window.deleteTrash=async id=>{if(!confirm('Apagar definitivamente?'))return;await deleteDoc(dref('trash',id));await audit('trash.delete_permanent',id);};
function renderTrash(){$('trashRows').innerHTML=state.trash.map(x=>`<tr><td>${esc(x.name||x.nome)}</td><td>${esc(x.code||x.codigo||'-')}</td><td>${esc(x.deletedAtISO||x.dataExclusao||'-')}</td><td><div class="row-actions"><button class="btn green sm" onclick="restoreTrash('${x.id}')">Restaurar</button><button class="btn red sm" onclick="deleteTrash('${x.id}')">Excluir</button></div></td></tr>`).join('');}

// CHAT
$('chatSend').onclick=async()=>{const message=$('chatMessage').value.trim();if(!message)return;const name=$('chatName').value.trim()||'Admin Diva';await addDoc(cref('chat'),{name,message,createdAt:serverTimestamp(),createdAtISO:nowISO(),createdAtMs:Date.now(),actor:currentUser.email});$('chatMessage').value='';await audit('chat.send','chat',{name});};
$('chatMessage').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatSend').click()}});
window.deleteChat=async id=>{if(!confirm('Excluir mensagem?'))return;await deleteDoc(dref('chat',id));await audit('chat.delete',id)};
function renderChat(){$('chatRows').innerHTML=state.chat.map(x=>`<div class="message"><div class="m-top"><strong>${esc(x.name||x.nome||'Usuário')}</strong><small>${esc(x.createdAtISO||x.data||'')}</small></div><p>${esc(x.message||x.mensagem||'')}</p><div class="row-actions" style="margin-top:8px"><button class="btn red sm" onclick="deleteChat('${x.id}')">Excluir</button></div></div>`).join('')||'<div class="note">Nenhuma mensagem.</div>';}

// MEDIA — 100% FIRESTORE (sem Firebase Storage / sem Blaze)
const MEDIA_MAX_DOC_CHARS = 620000; // margem confortável abaixo do limite de 1 MiB por documento
const MEDIA_TARGET_BYTES = 330 * 1024;
function mediaRef(id){ return `media:${id}`; }
function dataUrlBytes(dataUrl){
  const b64=String(dataUrl||'').split(',')[1]||'';
  return Math.ceil(b64.length*3/4);
}
async function loadBitmap(file){
  if('createImageBitmap' in window){ try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{} }
  return await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url;});
}
async function compressImageForFirestore(file){
  if(!file.type.startsWith('image/')) throw new Error('Envie somente imagens.');
  if(file.size>18*1024*1024) throw new Error('Imagem original acima de 18 MB.');
  const img=await loadBitmap(file); const ow=img.width, oh=img.height;
  let maxDim=1600, quality=.82, best='';
  for(let attempt=0;attempt<12;attempt++){
    const scale=Math.min(1,maxDim/Math.max(ow,oh));
    const w=Math.max(1,Math.round(ow*scale)), h=Math.max(1,Math.round(oh*scale));
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    let dataUrl=canvas.toDataURL('image/webp',quality);
    if(!dataUrl.startsWith('data:image/webp')) dataUrl=canvas.toDataURL('image/jpeg',quality);
    best=dataUrl;
    if(dataUrl.length<=MEDIA_MAX_DOC_CHARS && dataUrlBytes(dataUrl)<=MEDIA_TARGET_BYTES) return {dataUrl,width:w,height:h,bytes:dataUrlBytes(dataUrl),mime:dataUrl.slice(5,dataUrl.indexOf(';'))};
    if(quality>.54) quality-=.08; else {maxDim=Math.round(maxDim*.82);quality=.76;}
  }
  if(best.length>MEDIA_MAX_DOC_CHARS) throw new Error('Não foi possível otimizar esta imagem. Tente uma imagem menor.');
  return {dataUrl:best,width:ow,height:oh,bytes:dataUrlBytes(best),mime:best.slice(5,best.indexOf(';'))};
}
$('mediaUpload').onclick=async()=>{
  const file=$('mediaFile').files?.[0]; if(!file){toast('Escolha uma imagem.','error');return}
  setBusy($('mediaUpload'),true,'Compactando...');
  try{
    const out=await compressImageForFirestore(file);
    const refDoc=await addDoc(cref('media'),{
      name:file.name, dataUrl:out.dataUrl, public:true, storage:'firestore',
      originalSize:file.size, size:out.bytes, type:out.mime, width:out.width, height:out.height,
      createdAt:serverTimestamp(), createdAtISO:nowISO()
    });
    await audit('media.firestore_upload',file.name,{id:refDoc.id,originalSize:file.size,size:out.bytes,width:out.width,height:out.height});
    $('mediaFile').value=''; toast(`Imagem adicionada à biblioteca (${Math.round(out.bytes/1024)} KB).`);
  }catch(e){console.error(e);toast(e.message||'Falha ao salvar a imagem.','error')}
  finally{setBusy($('mediaUpload'),false)}
};
window.copyMedia=async id=>{const x=state.media.find(x=>x.id===id);if(!x)return;await navigator.clipboard.writeText(mediaRef(id));toast('Referência da imagem copiada.','info')};
window.copyMediaData=async id=>{const x=state.media.find(x=>x.id===id);if(!x)return;await navigator.clipboard.writeText(x.dataUrl||x.url||'');toast('Dados da imagem copiados.','info')};
window.deleteMedia=async id=>{const x=state.media.find(x=>x.id===id);if(!x||!confirm('Excluir esta imagem da biblioteca?'))return;await deleteDoc(dref('media',id));await audit('media.delete',x.name);toast('Mídia excluída.')};
function renderMedia(){
  $('mediaGrid').innerHTML=state.media.map(x=>{const src=x.dataUrl||x.url||'imagens/logo.png';const kb=(Number(x.size||0)/1024).toFixed(0);return `<div class="media-card"><img src="${esc(src)}" alt="${esc(x.name)}"><div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small>${kb} KB • ${x.storage==='firestore'?'Biblioteca':'legado'}</small><code style="display:block;margin-top:6px;font-size:10px;color:var(--muted)">${esc(mediaRef(x.id))}</code><div class="row-actions" style="margin-top:8px"><button class="btn gray sm" onclick="copyMedia('${x.id}')">Copiar referência</button><button class="btn red sm" onclick="deleteMedia('${x.id}')">Excluir</button></div></div></div>`}).join('')||'<div class="note">Nenhuma imagem enviada.</div>';
}

// SETTINGS
function fillSettings(){const s=state.settings||{};$('setCompany').value=s.companyName||'Alderico Kleimpaul';$('setTitle').value=s.siteTitle||'Alderico Kleimpaul';$('setWhatsapp').value=s.whatsapp||'5549999973286';$('setInstagram').value=s.instagram||'https://instagram.com/alderico_kleimpaul';$('setAccent').value=s.accent||'#ff6a00';$('setAccent2').value=s.accent2||'#ff9a4a';$('setLogo').value=s.logoUrl||'';$('setBadge').checked=false;}
$('settingsSave').onclick=async()=>{const data={companyName:$('setCompany').value.trim(),siteTitle:$('setTitle').value.trim(),whatsapp:$('setWhatsapp').value.trim(),instagram:$('setInstagram').value.trim(),accent:$('setAccent').value,accent2:$('setAccent2').value,logoUrl:$('setLogo').value.trim(),showFirebaseBadge:false,updatedAt:serverTimestamp(),updatedAtISO:nowISO()};await setDoc(dref('site_settings','config'),data,{merge:true});await audit('settings.update','site_settings/config');toast('Configurações salvas.');};

// AUDIT
function renderAudit(){$('auditRows').innerHTML=state.audit.map(x=>`<tr><td>${esc(x.createdAtISO||fmtDate(x.createdAt))}</td><td>${esc(x.action)}</td><td>${esc(x.target||'-')}</td><td><code>${esc(JSON.stringify(x.details||{})).slice(0,260)}</code></td></tr>`).join('');}

// BACKUP — snapshots fragmentados no FIRESTORE (sem Storage)
const BACKUP_CHUNK_CHARS=480000;
function splitBackupText(text){const out=[];let i=0;while(i<text.length){let end=Math.min(text.length,i+BACKUP_CHUNK_CHARS);if(end<text.length){const c=text.charCodeAt(end-1);if(c>=0xD800&&c<=0xDBFF)end--;}out.push(text.slice(i,end));i=end;}return out;}
async function getBackupChunks(backupId){
  const snap=await getDocs(query(cref('backup_chunks'),where('backupId','==',backupId)));
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>Number(a.index||0)-Number(b.index||0));
}
async function exportData(){
  const data={}; const settings=await getDoc(dref('site_settings','config')); data.site_settings=settings.exists()?{config:settings.data()}:{config:{}};
  for(const name of COLLECTIONS){ const s=await getDocs(cref(name)); data[name]=s.docs.map(d=>({id:d.id,...d.data(),createdAt:undefined,updatedAt:undefined,deletedAt:undefined})); }
  const core={schemaVersion:3,companyId,projectId:FIREBASE_CONFIG.projectId,exportedAt:nowISO(),data};
  const checksum=await sha256(JSON.stringify(core)); return {...core,checksum};
}
$('backupDownload').onclick=async()=>{setBusy($('backupDownload'),true,'Gerando...');try{const payload=await exportData();downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`kleimpaul-empresa-${companyId}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);await audit('backup.download','local',{records:countRecords(payload),checksum:payload.checksum});toast('Backup completo baixado.');}finally{setBusy($('backupDownload'),false)}};
$('backupCloud').onclick=async()=>{
  setBusy($('backupCloud'),true,'Criando backup...');
  try{
    const payload=await exportData(); const text=JSON.stringify(payload); const chunks=splitBackupText(text); const backupId=`backup_${Date.now()}`;
    const ops=[]; chunks.forEach((chunk,index)=>ops.push(b=>b.set(dref('backup_chunks',`${backupId}_${String(index).padStart(4,'0')}`),{backupId,index,payload:chunk})));
    await commitOps(ops);
    await setDoc(dref('backups',backupId),{file:`${backupId}.json`,storage:'firestore',size:new Blob([text]).size,records:countRecords(payload),checksum:payload.checksum,chunkCount:chunks.length,createdAt:serverTimestamp(),createdAtISO:nowISO(),createdAtMs:Date.now()});
    await audit('backup.cloud_firestore',backupId,{records:countRecords(payload),chunks:chunks.length}); toast('Backup criado com sucesso.');
  }catch(e){console.error(e);toast(`Falha no backup cloud: ${e.message}`,'error')}
  finally{setBusy($('backupCloud'),false)}
};
window.downloadCloudBackup=async id=>{const x=state.backups.find(x=>x.id===id);if(!x)return;const chunks=await getBackupChunks(id);if(!chunks.length){toast('Blocos do backup não encontrados.','error');return}const text=chunks.map(c=>c.payload||'').join('');downloadBlob(new Blob([text],{type:'application/json'}),x.file||'backup.json');await audit('backup.cloud_download',x.file,{chunks:chunks.length})};
window.deleteCloudBackup=async id=>{const x=state.backups.find(x=>x.id===id);if(!x||!confirm('Excluir este backup?'))return;const chunks=await getBackupChunks(id);const ops=chunks.map(c=>(b)=>b.delete(dref('backup_chunks',c.id)));ops.push(b=>b.delete(dref('backups',id)));await commitOps(ops);await audit('backup.cloud_delete',x.file,{chunks:chunks.length});toast('Backup excluído.')};
function renderBackups(){$('backupRows').innerHTML=state.backups.map(x=>`<tr><td>${esc(x.createdAtISO||'-')}</td><td>${(Number(x.size||0)/1024).toFixed(1)} KB</td><td>${Number(x.records||0)}</td><td><div class="row-actions"><button class="btn gray sm" onclick="downloadCloudBackup('${x.id}')">Baixar</button><button class="btn red sm" onclick="deleteCloudBackup('${x.id}')">Excluir</button></div></td></tr>`).join('')||'<tr><td colspan="4" style="color:var(--muted)">Nenhum backup disponível.</td></tr>'}

async function commitOps(ops){for(let i=0;i<ops.length;i+=400){const b=writeBatch(db);ops.slice(i,i+400).forEach(op=>op(b));await b.commit();}}
async function clearCollection(name){const s=await getDocs(cref(name));const ops=s.docs.map(d=>(b)=>b.delete(d.ref));await commitOps(ops);}
async function restorePayload(payload,clearFirst){
  if(String(payload.companyId)!==String(companyId)) throw new Error('Backup pertence a outra empresa.');
  const chk=payload.checksum; const core={schemaVersion:payload.schemaVersion,companyId:payload.companyId,projectId:payload.projectId,exportedAt:payload.exportedAt,data:payload.data};
  if(chk && await sha256(JSON.stringify(core))!==chk) throw new Error('Checksum inválido.');
  if(clearFirst){for(const n of COLLECTIONS.filter(x=>x!=='audit')) await clearCollection(n);}
  const cfg=payload.data?.site_settings?.config||{}; if(Object.keys(cfg).length) await setDoc(dref('site_settings','config'),cfg,{merge:false});
  for(const name of COLLECTIONS.filter(x=>x!=='audit')){const rows=Array.isArray(payload.data?.[name])?payload.data[name]:[];const ops=rows.map(row=>(b)=>{const clean={...row};const id=clean.id||doc(cref(name)).id;delete clean.id; b.set(dref(name,id),clean);});await commitOps(ops);}
}
$('restoreBtn').onclick=async()=>{const file=$('restoreFile').files?.[0];if(!file){toast('Selecione o JSON do backup.','error');return}if(!confirm('Restaurar este backup?'))return;setBusy($('restoreBtn'),true,'Restaurando...');try{const payload=JSON.parse(await file.text());await restorePayload(payload,$('restoreClear').checked);await audit('backup.restore',file.name,{clearFirst:$('restoreClear').checked});toast('Backup restaurado com sucesso.');}catch(e){console.error(e);toast(`Falha: ${e.message}`,'error')}finally{setBusy($('restoreBtn'),false)}};
async function verifyDatabase(showToast=true){try{const cfg=await getDoc(dref('site_settings','config'));const counts={};for(const n of ['site_overrides','highlights','catalog_items','inventory','trash','chat','media']) counts[n]=(await getDocs(cref(n))).size;const issues=[];if(!cfg.exists())issues.push('configurações globais ausentes');if(state.inventory.some(x=>!x.name||!x.code))issues.push('estoque com campos obrigatórios vazios');$('backupIntegrity').textContent=issues.length?`Atenção: ${issues.join('; ')}.`:`Banco íntegro. ${Object.values(counts).reduce((a,b)=>a+b,0)} registros verificados.`;if(showToast)toast(issues.length?'Verificação concluída com alertas.':'Banco verificado.','info');return{counts,issues};}catch(e){$('backupIntegrity').textContent='Não foi possível verificar o banco.';if(showToast)toast('Erro na verificação.','error')}}
$('verifyBtn').onclick=()=>verifyDatabase(true);

// MIGRAÇÃO LEGADA (coleções raiz do painel antigo)
async function migrateLegacy(){
  if(!confirm('Migrar dados das coleções antigas pecas/lixeira/chat para empresas/1? Registros existentes não serão apagados.'))return;
  let migrated=0;
  const legacy=[['pecas','inventory'],['lixeira','trash'],['chat','chat']];
  for(const [oldName,newName] of legacy){
    let snap; try{snap=await getDocs(collection(db,oldName));}catch(e){continue}
    const ops=snap.docs.map(d=>(b)=>{const x=d.data();let out={...x,legacyId:d.id,migratedAtISO:nowISO()};if(oldName==='pecas')out={name:x.nome||x.name||'',code:x.codigo||x.code||'',category:x.categoria||x.category||'',qty:Number(x.qtd??x.qty??0),minQty:5,price:Number(x.valor??x.price??0),legacyId:d.id,migratedAtISO:nowISO()};if(oldName==='lixeira')out={name:x.nome||x.name||'',code:x.codigo||x.code||'',category:x.categoria||x.category||'',qty:Number(x.qtd??x.qty??0),price:Number(x.valor??x.price??0),deletedAtISO:x.dataExclusao||nowISO(),legacyId:d.id,migratedAtISO:nowISO()};if(oldName==='chat')out={name:x.nome||x.name||'Usuário',message:x.mensagem||x.message||'',createdAtISO:x.data||nowISO(),createdAtMs:Number(x.dataCriacao||Date.now()),legacyId:d.id,migratedAtISO:nowISO()};b.set(dref(newName,`legacy_${d.id}`),out,{merge:true});migrated++;});await commitOps(ops);
  }
  await audit('legacy.migrate','root_collections',{migrated});toast(`${migrated} registros legados migrados.`);
}
function injectLegacyButton(){const backupSection=document.querySelector('[data-section="backup"] .section-head');if(!backupSection||$('legacyMigrate'))return;const b=document.createElement('button');b.id='legacyMigrate';b.className='btn gray';b.innerHTML='<i class="fa-solid fa-shuffle"></i>Migrar dados antigos';b.onclick=migrateLegacy;backupSection.appendChild(b);}

renderNav(); populatePages(); injectLegacyButton(); fillSettings();
