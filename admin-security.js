import { FIREBASE_CONFIG, DEFAULT_COMPANY_ID, adminEmail } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const app=getApps().length?getApps()[0]:initializeApp(FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),companyId=DEFAULT_COMPANY_ID;
const EXPECTED=adminEmail('diva','1');
const PIN_HASH='77e0d06fbdf3e83a24c389fc4004e5bbc21cc90399f24864ef95f8cf8d63eb32';
let failures=0,lockUntil=0;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function digest(text){const b=new TextEncoder().encode(String(text));const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function ensureModal(){
  if(document.getElementById('dangerPinModal'))return;
  const wrap=document.createElement('div');wrap.id='dangerPinModal';wrap.className='danger-pin-modal';wrap.hidden=true;
  wrap.innerHTML=`<div class="danger-pin-backdrop"></div><div class="danger-pin-card" role="dialog" aria-modal="true" aria-labelledby="dangerPinTitle"><div class="danger-pin-icon"><i class="fa-solid fa-shield-halved"></i></div><div><span class="danger-pin-kicker">CONFIRMAÇÃO DE SEGURANÇA</span><h3 id="dangerPinTitle">Autorizar exclusão definitiva</h3><p id="dangerPinMessage">Esta ação não pode ser desfeita pelo item ativo.</p></div><div class="danger-pin-target" id="dangerPinTarget"></div><label>Senha de exclusão definitiva</label><div class="danger-pin-input"><input id="dangerPinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="Digite a senha"><button id="dangerPinEye" type="button" aria-label="Mostrar senha"><i class="fa-solid fa-eye"></i></button></div><div class="danger-pin-error" id="dangerPinError"></div><div class="danger-pin-actions"><button class="btn gray" id="dangerPinCancel" type="button">Cancelar</button><button class="btn red" id="dangerPinConfirm" type="button"><i class="fa-solid fa-lock"></i>Autorizar</button></div><small>Antes de registros importantes serem apagados, o sistema cria uma cópia no Cofre de Recuperação quando possível.</small></div>`;
  document.body.appendChild(wrap);
}
function closeModal(result){const modal=document.getElementById('dangerPinModal');if(!modal)return;modal.hidden=true;modal._resolve?.(result);modal._resolve=null;document.getElementById('dangerPinInput').value='';}
async function confirmPermanent({label='registro',message='Esta exclusão é definitiva.'}={}){
  ensureModal();
  if(auth.currentUser?.email?.toLowerCase()!==EXPECTED)return false;
  const now=Date.now(); if(now<lockUntil){const sec=Math.ceil((lockUntil-now)/1000);alert(`Muitas tentativas incorretas. Aguarde ${sec}s.`);return false;}
  const modal=document.getElementById('dangerPinModal'),input=document.getElementById('dangerPinInput'),err=document.getElementById('dangerPinError');
  document.getElementById('dangerPinMessage').textContent=message;
  document.getElementById('dangerPinTarget').innerHTML=`<i class="fa-solid fa-triangle-exclamation"></i><span>${esc(label)}</span>`;
  err.textContent='';modal.hidden=false;setTimeout(()=>input.focus(),30);
  return await new Promise(resolve=>{
    modal._resolve=resolve;
    document.getElementById('dangerPinCancel').onclick=()=>closeModal(false);
    modal.querySelector('.danger-pin-backdrop').onclick=()=>closeModal(false);
    document.getElementById('dangerPinEye').onclick=()=>{input.type=input.type==='password'?'text':'password';document.getElementById('dangerPinEye').innerHTML=`<i class="fa-solid ${input.type==='password'?'fa-eye':'fa-eye-slash'}"></i>`};
    const submit=async()=>{
      const hash=await digest(input.value.trim());
      if(hash===PIN_HASH){failures=0;closeModal(true);return;}
      failures++;input.value='';err.textContent='Senha de exclusão incorreta.';input.focus();
      if(failures>=3){lockUntil=Date.now()+15000;failures=0;err.textContent='3 tentativas incorretas. Bloqueado por 15 segundos.';}
    };
    document.getElementById('dangerPinConfirm').onclick=submit;
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit()}else if(e.key==='Escape')closeModal(false)};
  });
}
async function jsonHash(value){try{return await digest(JSON.stringify(value??null))}catch{return''}}
async function protectRecord(collectionName,id,data,meta={}){
  if(!collectionName||!id)return null;
  try{
    const clean=(data&&typeof data==='object')?{...data}:data;if(clean&&typeof clean==='object')delete clean.id;const payload={sourceCollection:collectionName,sourceId:String(id),label:String(meta.label||data?.name||data?.title||data?.number||id),reason:String(meta.reason||'delete_permanent'),data:clean??{},checksum:await jsonHash(clean),createdAt:serverTimestamp(),createdAtISO:new Date().toISOString(),createdAtMs:Date.now(),actor:auth.currentUser?.email||''};
    const ref=await addDoc(collection(db,'empresas',companyId,'recovery_vault'),payload);return ref.id;
  }catch(e){console.error('recovery vault',e);throw new Error('Não foi possível criar a cópia de segurança antes da exclusão. A exclusão foi cancelada.');}
}
async function authorizeDelete({collectionName,id,data,label,message,skipVault=false}={}){
  const ok=await confirmPermanent({label,message}); if(!ok)return false;
  if(!skipVault&&collectionName&&id)await protectRecord(collectionName,id,data,{label,reason:'delete_permanent'});
  return true;
}
window.KleimpaulSecurity={confirmPermanent,protectRecord,authorizeDelete};
