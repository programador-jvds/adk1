/* Kleimpaul — refinamento de navegação, destaques e página de motosserras. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const PAGE=((location.pathname.split('/').pop()||'index.html').toLowerCase().replace(/\.html?$/,'')||'index');
function removeFloatingContact(){ $$('.cms-floating-contact').forEach(x=>x.remove()); }
function installStoryReel(){
  const section=$('#stories'),wrap=section?.querySelector('.stories-wrapper');if(!section||!wrap)return;
  if(!wrap.parentElement.classList.contains('stories-reel-shell')){const shell=document.createElement('div');shell.className='stories-reel-shell';wrap.parentNode.insertBefore(shell,wrap);shell.appendChild(wrap);const prev=document.createElement('button'),next=document.createElement('button');prev.type=next.type='button';prev.className='story-reel-btn prev';next.className='story-reel-btn next';prev.innerHTML='<i class="fa-solid fa-chevron-left"></i>';next.innerHTML='<i class="fa-solid fa-chevron-right"></i>';prev.setAttribute('aria-label','Destaques anteriores');next.setAttribute('aria-label','Próximos destaques');shell.append(prev,next);const progress=document.createElement('div');progress.className='story-reel-progress';progress.innerHTML='<i></i>';shell.insertAdjacentElement('afterend',progress);const step=()=>Math.max(220,wrap.clientWidth*.68);prev.onclick=()=>wrap.scrollBy({left:-step(),behavior:'smooth'});next.onclick=()=>wrap.scrollBy({left:step(),behavior:'smooth'});const update=()=>{const max=wrap.scrollWidth-wrap.clientWidth;const ratio=max>0?wrap.scrollLeft/max:0;prev.disabled=wrap.scrollLeft<4;next.disabled=wrap.scrollLeft>max-4;const bar=$('i',progress);if(bar)bar.style.width=`${Math.max(16,Math.min(100,16+ratio*84))}%`;};wrap.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});new ResizeObserver(update).observe(wrap);setTimeout(update,100);}
}
function enhanceStoryViewer(){
  const img=$('#storyImage'),box=img?.closest('.stories-image-wrapper'),modal=$('#storiesModal');if(!img||!box)return;
  const update=()=>{const src=img.currentSrc||img.src||'';box.style.setProperty('--story-backdrop',src?`url("${src.replace(/"/g,'\\"')}")`:'none');};img.addEventListener('load',update);new MutationObserver(update).observe(img,{attributes:true,attributeFilter:['src']});update();
  let sx=0,sy=0;box.addEventListener('touchstart',e=>{const t=e.changedTouches[0];sx=t.clientX;sy=t.clientY;},{passive:true});box.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25){(dx<0?$('#nextBtn'):$('#prevBtn'))?.click();}},{passive:true});
  modal?.addEventListener('click',e=>{if(e.target.closest('a,button'))return;const r=box.getBoundingClientRect();if(e.clientX<r.left+r.width*.34)$('#prevBtn')?.click();else if(e.clientX>r.left+r.width*.66)$('#nextBtn')?.click();});
}
function standardizeMotosserras(){
  if(PAGE!=='motosserras')return;document.body.classList.add('moto-standard');
  const hero=$('.hero'),container=hero?.querySelector(':scope > .container'),content=container?.querySelector('.hero-content');
  if(container&&content&&!container.querySelector('.moto-hero-grid')){const grid=document.createElement('div');grid.className='moto-hero-grid';content.replaceWith(grid);const visual=document.createElement('div');visual.className='moto-hero-visual';visual.innerHTML='<img src="imagens/motosserra.png" alt="Motosserras Alderico Kleimpaul" fetchpriority="high">';grid.append(visual,content);}
  if(hero&&!$('.moto-breadcrumb')){const b=document.createElement('section');b.className='moto-breadcrumb';b.innerHTML='<div class="container"><a href="index.html"><i class="fa-solid fa-house"></i> Início</a><i class="fa-solid fa-chevron-right"></i><a href="index.html#produtos">Produtos</a><i class="fa-solid fa-chevron-right"></i><span>Motosserras</span></div>';hero.insertAdjacentElement('beforebegin',b);const rail=$('.cms-category-rail');if(rail)b.insertAdjacentElement('afterend',rail);}
  $$('.nav-menu a[href="#sobre"]').forEach(a=>a.href='index.html#sobre');$$('.nav-menu a[href="#contato"]').forEach(a=>a.href='index.html#contato');$$('.nav-menu a[href="#suporte"]').forEach(a=>a.href='index.html#contato');
}
function observeDynamic(){const target=document.body;let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{removeFloatingContact();installStoryReel();},100)}).observe(target,{childList:true,subtree:true});}
function init(){removeFloatingContact();standardizeMotosserras();installStoryReel();enhanceStoryViewer();observeDynamic();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
