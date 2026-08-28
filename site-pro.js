/* Kleimpaul — camada de experiência pública. Sem dependência de backend. */
(()=>{
  'use strict';

  const PAGE = ((location.pathname.split('/').pop() || 'index.html').toLowerCase().replace(/\.html?$/,'') || 'index');
  const PAGE_DATA = [
    {key:'index',label:'Início',href:'index.html',icon:'fa-house',type:'Institucional',desc:'Equipamentos, peças, assistência técnica e atendimento especializado.',aliases:'home empresa loja kleimpaul stihl xanxere'},
    {key:'motosserras',label:'Motosserras',href:'motosserras.html',icon:'fa-tree',type:'Equipamentos',desc:'Motosserras para uso profissional, rural e manutenção.',aliases:'motosserra serra motor ms stihl corte madeira'},
    {key:'rocadeiras',label:'Roçadeiras',href:'rocadeiras.html',icon:'fa-seedling',type:'Equipamentos',desc:'Soluções para limpeza, terrenos, jardins e áreas verdes.',aliases:'rocadeira roçadeira mato grama terreno stihl'},
    {key:'sopradores',label:'Sopradores',href:'sopradores.html',icon:'fa-wind',type:'Equipamentos',desc:'Agilidade e potência para limpeza de áreas externas.',aliases:'soprador folhas limpeza vento stihl'},
    {key:'lavadoras',label:'Lavadoras',href:'lavadoras.html',icon:'fa-droplet',type:'Equipamentos',desc:'Lavadoras para limpezas exigentes e aplicações profissionais.',aliases:'lavadora pressao pressão limpeza agua água'},
    {key:'correias',label:'Correias',href:'correias.html',icon:'fa-arrows-spin',type:'Peças e acessórios',desc:'Correias para transmissão com opções para diversas aplicações.',aliases:'correia transmissão transmissao medida perfil'},
    {key:'rolamentos',label:'Rolamentos',href:'rolamentos.html',icon:'fa-circle-dot',type:'Peças e acessórios',desc:'Rolamentos para manutenção, reposição e aplicações mecânicas.',aliases:'rolamento esfera rolete mancal eixo'},
    {key:'retentores',label:'Retentores',href:'retentores.html',icon:'fa-ring',type:'Peças e acessórios',desc:'Retentores e soluções de vedação para diferentes medidas.',aliases:'retentor vedação vedacao eixo alojamento medida'},
    {key:'mancais',label:'Mancais',href:'mancais.html',icon:'fa-gear',type:'Peças e acessórios',desc:'Mancais para apoio, alinhamento e manutenção de conjuntos mecânicos.',aliases:'mancal rolamento suporte eixo'},
    {key:'mangueiras',label:'Mangueiras',href:'mangueiras.html',icon:'fa-bezier-curve',type:'Peças e acessórios',desc:'Mangueiras para manutenção e aplicações técnicas variadas.',aliases:'mangueira tubo flexivel flexível hidráulica hidraulica'},
    {key:'oleos',label:'Óleos e lubrificantes',href:'oleos.html',icon:'fa-oil-can',type:'Peças e acessórios',desc:'Lubrificação e proteção para equipamentos e componentes.',aliases:'oleo óleo lubrificante lubrificação lubrificacao graxa'},
    {key:'pinhao',label:'Pinhões',href:'pinhao.html',icon:'fa-gears',type:'Peças e acessórios',desc:'Pinhões para transmissão e reposição em diferentes conjuntos.',aliases:'pinhao pinhão engrenagem transmissão transmissao'},
    {key:'polias',label:'Polias',href:'polias.html',icon:'fa-compact-disc',type:'Peças e acessórios',desc:'Polias e componentes para sistemas de transmissão.',aliases:'polia correia transmissão transmissao eixo'},
    {key:'diversos',label:'Diversos',href:'diversos.html',icon:'fa-boxes-stacked',type:'Produtos diversos',desc:'Produtos variados, utilidades e itens especiais.',aliases:'diversos outros produto utilidade geral'}
  ];

  const MOTO_MODELS = [];
  const state = {dynamic:[], catalogLoaded:false, catalogLoading:false, activeIndex:-1};

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentData=()=>PAGE_DATA.find(x=>x.key===PAGE);

  function staticSearchIndex(){
    const pages=PAGE_DATA.map(x=>({...x,search:norm([x.label,x.type,x.desc,x.aliases].join(' '))}));
    const models=MOTO_MODELS.map(name=>({
      key:`moto-${norm(name).replace(/ /g,'-')}`,label:name,href:`motosserras.html?q=${encodeURIComponent(name)}`,icon:'fa-tree',type:'Modelo de motosserra',
      desc:'Veja este modelo na linha de motosserras.',aliases:`motosserra stihl ${name}`,search:norm(`motosserra stihl ${name}`)
    }));
    const service=[
      {key:'contato',label:'Contato e orçamento',href:'index.html#contato',icon:'fa-comments',type:'Atendimento',desc:'Fale com a equipe para orçamento, aplicação e disponibilidade.',aliases:'whatsapp telefone orçamento orcamento atendimento suporte'},
      {key:'sobre',label:'Sobre a Kleimpaul',href:'index.html#sobre',icon:'fa-store',type:'Institucional',desc:'Conheça a tradição, experiência e compromisso da empresa.',aliases:'empresa historia história loja tradição tradicao'}
    ].map(x=>({...x,search:norm([x.label,x.type,x.desc,x.aliases].join(' '))}));
    return [...pages,...models,...service];
  }

  function dynamicSearchIndex(){
    return state.dynamic.map((x,i)=>{
      const category=PAGE_DATA.find(p=>p.key===x.category);
      const specs=Array.isArray(x.specs)?x.specs.map(s=>`${s.label||''} ${s.value||''}`).join(' '):Array.isArray(x.info)?x.info.map(s=>`${s.label||''} ${s.value||''}`).join(' '):'';
      const label=x.name||x.title||'Produto';
      return {
        key:`dyn-${x.id||i}`,label,href:`${category?.href||((x.category||PAGE)+'.html')}?q=${encodeURIComponent(label)}`,
        icon:'fa-box-open',type:category?.label||'Produto',desc:x.description||specs||'Consulte detalhes e disponibilidade.',
        aliases:[x.badge,x.slug,specs].filter(Boolean).join(' '),search:norm([label,x.description,x.badge,x.category,specs].join(' '))
      };
    });
  }

  function score(item,query){
    const q=norm(query); if(!q)return 1;
    const tokens=q.split(/\s+/).filter(Boolean); const title=norm(item.label); const hay=item.search||norm([item.label,item.desc,item.aliases,item.type].join(' '));
    if(!tokens.every(t=>hay.includes(t))) return -1;
    let s=0;
    if(title===q)s+=100;
    if(title.startsWith(q))s+=55;
    if(title.includes(q))s+=35;
    tokens.forEach(t=>{ if(title.includes(t))s+=14; if(hay.includes(t))s+=4; });
    if(item.key===PAGE)s+=3;
    return s;
  }

  function search(query){
    const all=[...staticSearchIndex(),...dynamicSearchIndex()];
    const dedupe=new Map();
    all.forEach(item=>{
      const k=`${item.href}|${norm(item.label)}`;
      const sc=score(item,query);
      if(sc>=0 && (!dedupe.has(k)||dedupe.get(k)._score<sc)) dedupe.set(k,{...item,_score:sc});
    });
    return [...dedupe.values()].sort((a,b)=>b._score-a._score || a.label.localeCompare(b.label,'pt-BR')).slice(0,14);
  }

  function ensureSearchModal(){
    if($('#cmsSearchModal')) return;
    const modal=document.createElement('div'); modal.id='cmsSearchModal'; modal.className='cms-search-modal'; modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="cms-search-backdrop" data-search-close></div>
      <section class="cms-search-panel" role="dialog" aria-modal="true" aria-label="Pesquisar no site">
        <div class="cms-search-input-row">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="cmsGlobalSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Pesquisar produtos, peças, modelos..." aria-label="Pesquisar produtos, peças e modelos">
          <button type="button" class="cms-search-close" data-search-close aria-label="Fechar pesquisa"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="cms-search-suggestions" id="cmsSearchSuggestions">
          <span>Buscas rápidas:</span>
          <button data-search-term="motosserras">Motosserras</button><button data-search-term="rolamentos">Rolamentos</button><button data-search-term="diversos">Diversos</button><button data-search-term="óleos">Óleos</button>
        </div>
        <div class="cms-search-meta"><span id="cmsSearchStatus">Digite para encontrar o que precisa</span><kbd>ESC</kbd></div>
        <div class="cms-search-results" id="cmsSearchResults"></div>
        <div class="cms-search-footer"><span><i class="fa-solid fa-arrow-pointer"></i> Selecione um resultado</span><span><i class="fa-solid fa-keyboard"></i> Ctrl + K para pesquisar</span></div>
      </section>`;
    document.body.appendChild(modal);
    const input=$('#cmsGlobalSearch');
    input.addEventListener('input',()=>renderSearch(input.value));
    input.addEventListener('keydown',searchKeys);
    $$('[data-search-close]',modal).forEach(x=>x.addEventListener('click',closeSearch));
    $$('[data-search-term]',modal).forEach(x=>x.addEventListener('click',()=>{input.value=x.dataset.searchTerm;renderSearch(input.value);input.focus();}));
  }

  async function loadCatalogForSearch(){
    if(state.catalogLoaded||state.catalogLoading)return;
    const fn=window.KleimpaulCMS?.getSearchCatalog;
    if(typeof fn!=='function') return;
    state.catalogLoading=true;
    try{
      const rows=await fn();
      if(Array.isArray(rows)){ state.dynamic=rows; state.catalogLoaded=true; const input=$('#cmsGlobalSearch'); if(input)renderSearch(input.value); }
    }catch{} finally{state.catalogLoading=false;}
  }

  function renderSearch(query=''){
    const box=$('#cmsSearchResults'),status=$('#cmsSearchStatus'); if(!box)return;
    const results=search(query);
    state.activeIndex=-1;
    if(!query.trim()){
      const featured=PAGE_DATA.filter(x=>x.key!=='index').slice(0,8);
      status.textContent='Categorias mais procuradas';
      box.innerHTML=featured.map(resultHTML).join('');
      return;
    }
    status.textContent=results.length?`${results.length} ${results.length===1?'resultado encontrado':'resultados encontrados'}`:'Nenhum resultado encontrado';
    if(!results.length){
      box.innerHTML=`<div class="cms-search-empty"><i class="fa-solid fa-magnifying-glass"></i><h3>Não encontramos “${esc(query)}”</h3><p>Tente outro nome, código, categoria ou fale com nossa equipe.</p><a href="index.html#contato" class="cms-search-contact">Falar com a equipe <i class="fa-solid fa-arrow-right"></i></a></div>`;
      return;
    }
    box.innerHTML=results.map(resultHTML).join('');
  }

  function resultHTML(x){
    return `<a class="cms-search-result" href="${esc(x.href)}" data-search-result>
      <span class="cms-search-result-icon"><i class="fa-solid ${esc(x.icon||'fa-box')}"></i></span>
      <span class="cms-search-result-copy"><small>${esc(x.type||'Resultado')}</small><strong>${esc(x.label)}</strong><em>${esc(x.desc||'')}</em></span>
      <i class="fa-solid fa-arrow-right cms-search-result-arrow"></i>
    </a>`;
  }

  function searchKeys(e){
    const rows=$$('[data-search-result]',$('#cmsSearchResults')); if(!rows.length)return;
    if(e.key==='ArrowDown'){e.preventDefault();state.activeIndex=(state.activeIndex+1)%rows.length;}
    else if(e.key==='ArrowUp'){e.preventDefault();state.activeIndex=(state.activeIndex-1+rows.length)%rows.length;}
    else if(e.key==='Enter'&&state.activeIndex>=0){e.preventDefault();rows[state.activeIndex].click();return;}
    else return;
    rows.forEach((r,i)=>r.classList.toggle('active',i===state.activeIndex)); rows[state.activeIndex]?.scrollIntoView({block:'nearest'});
  }

  function openSearch(seed=''){
    ensureSearchModal();
    const modal=$('#cmsSearchModal'),input=$('#cmsGlobalSearch');
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('cms-search-open');
    input.value=seed||''; renderSearch(input.value); setTimeout(()=>input.focus(),40); loadCatalogForSearch();
  }
  function closeSearch(){const modal=$('#cmsSearchModal');if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('cms-search-open');}

  function injectHeaderSearch(){
    if($('.cms-header-search')) return;
    const target=$('.header-controls')||$('header .navbar')||$('header .nav'); if(!target)return;
    const b=document.createElement('button');b.type='button';b.className='cms-header-search';b.setAttribute('aria-label','Pesquisar no site');
    b.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><span>Pesquisar</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click',()=>openSearch());
    if(target.classList.contains('header-controls'))target.prepend(b);else target.appendChild(b);
  }

  function injectHeroFinder(){
    if(PAGE!=='index'||$('.cms-hero-finder'))return;
    const host=$('.hero-content'); if(!host)return;
    const finder=document.createElement('div');finder.className='cms-hero-finder';finder.dataset.cmsUi='hero-search';
    finder.innerHTML=`<button class="cms-hero-search" type="button"><i class="fa-solid fa-magnifying-glass"></i><span><strong>O que você procura?</strong><small>Motosserras, peças, rolamentos, óleos e muito mais</small></span><kbd>Ctrl K</kbd></button>
      <div class="cms-hero-chips"><span>Atalhos:</span>${['Motosserras','Correias','Rolamentos','Diversos'].map(x=>`<button type="button" data-term="${x}">${x}</button>`).join('')}</div>`;
    const buttons=$('.hero-buttons',host); (buttons||host.lastElementChild)?.insertAdjacentElement('afterend',finder);
    $('.cms-hero-search',finder).onclick=()=>openSearch();
    $$('[data-term]',finder).forEach(x=>x.onclick=()=>openSearch(x.dataset.term));
  }

  function injectCategoryRail(){
    if(PAGE==='index'||PAGE==='desenvolvedor'||$('.cms-category-rail'))return;
    const current=currentData(); if(!current)return;
    const rail=document.createElement('div');rail.className='cms-category-rail';rail.innerHTML=`<div class="container"><div class="cms-category-rail-inner"><span class="cms-category-rail-label">Explorar</span>${PAGE_DATA.filter(x=>x.key!=='index').map(x=>`<a href="${x.href}" class="${x.key===PAGE?'active':''}"><i class="fa-solid ${x.icon}"></i>${x.label}</a>`).join('')}</div></div>`;
    const breadcrumb=$('.breadcrumb');
    if(breadcrumb) breadcrumb.insertAdjacentElement('afterend',rail);
    else {
      const header=$('header');
      header?.insertAdjacentElement('afterend',rail);
      if(header && getComputedStyle(header).position==='fixed') rail.classList.add('after-fixed-header');
    }
  }

  function injectCategoryAssist(){
    if(PAGE==='index'||PAGE==='desenvolvedor'||$('.cms-category-assist'))return;
    const current=currentData(); if(!current)return;
    const section=document.createElement('section');section.className='cms-category-assist';section.dataset.cmsUi='category-assist';
    section.innerHTML=`<div class="container"><div class="cms-assist-head"><div><span>ENCONTRE COM FACILIDADE</span><h2>Procure ${esc(current.label.toLowerCase())} do seu jeito</h2><p>Pesquise pelo nome, modelo, medida ou aplicação. Se preferir, nossa equipe ajuda a identificar a opção correta.</p></div><button class="cms-assist-search" type="button"><i class="fa-solid fa-magnifying-glass"></i><span><strong>Pesquisar no catálogo</strong><small>Digite nome, código ou aplicação</small></span><i class="fa-solid fa-arrow-right"></i></button></div><div class="cms-assist-grid"><article><i class="fa-solid fa-barcode"></i><div><strong>Nome ou código</strong><span>Use a busca para localizar rapidamente a categoria ou o produto.</span></div></article><article><i class="fa-solid fa-ruler-combined"></i><div><strong>Medida e aplicação</strong><span>Consulte especificações e confirme compatibilidade antes da escolha.</span></div></article><a href="index.html#contato"><i class="fa-solid fa-headset"></i><div><strong>Atendimento especializado</strong><span>Conte com orientação para encontrar a solução ideal.</span></div><i class="fa-solid fa-arrow-right"></i></a></div></div>`;
    const hero=$('.hero-product,.hero'); if(hero)hero.insertAdjacentElement('afterend',section); else $('main')?.prepend(section);
    $('.cms-assist-search',section).onclick=()=>openSearch(current.label);
  }

  function enhanceCatalogSearch(){
    if(PAGE==='motosserras')return;
    const section=$('.cms-catalog'); if(!section||$('.cms-catalog-local-search',section))return;
    const header=$('.cms-catalog-header',section); if(!header)return;
    const wrap=document.createElement('label');wrap.className='cms-catalog-local-search';wrap.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Filtrar esta categoria..." aria-label="Filtrar produtos desta categoria"><span data-local-count></span>';
    header.appendChild(wrap);
    const input=$('input',wrap),count=$('[data-local-count]',wrap);
    const filter=()=>{
      const q=norm(input.value); let visible=0;
      $$('.cms-catalog-card',section).forEach(card=>{const ok=!q||norm(card.textContent).includes(q);card.hidden=!ok;if(ok)visible++;});
      count.textContent=`${visible} ${visible===1?'item':'itens'}`;
    };
    input.addEventListener('input',filter);filter();
    const urlQ=new URLSearchParams(location.search).get('q'); if(urlQ){input.value=urlQ;filter();section.scrollIntoView({behavior:'smooth',block:'start'});}
  }

  function applyQueryToNativeSearch(){
    const q=new URLSearchParams(location.search).get('q'); if(!q)return;
    const input=$('#searchInput');
    if(input){input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>input.scrollIntoView({behavior:'smooth',block:'center'}),150);}
  }

  function enhanceImages(){
    $$('img').forEach((img,i)=>{
      img.decoding='async'; img.draggable=false;
      if(!img.hasAttribute('loading')&&i>1)img.loading='lazy';
      if(i===0||img.closest('.hero,.hero-product'))img.setAttribute('fetchpriority','high');
    });
  }

  function revealSections(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const nodes=$$('main section, body>section').filter(x=>!x.classList.contains('breadcrumb')).slice(0,35);
    nodes.forEach(x=>x.classList.add('cms-reveal'));
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target);}}),{rootMargin:'0px 0px -8% 0px',threshold:.06});
    nodes.forEach(x=>io.observe(x));
  }

  function injectScrollProgress(){
    if($('#cmsScrollProgress'))return; const bar=document.createElement('div');bar.id='cmsScrollProgress';bar.className='cms-scroll-progress';document.body.appendChild(bar);
    let ticking=false;const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;bar.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;ticking=false;};
    addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(update);ticking=true;}},{passive:true});update();
  }

  function polishLogoLinks(){
    $$('.logo[href="desenvolvedor.html"]').forEach(a=>a.href='index.html');
  }

  function keyboard(){
    addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}
      else if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement?.tagName||'')){e.preventDefault();openSearch();}
      else if(e.key==='Escape')closeSearch();
    });
  }

  function init(){
    document.body.classList.add(`cms-page-${PAGE}`);
    document.documentElement.dataset.page=PAGE;
    polishLogoLinks();ensureSearchModal();injectHeaderSearch();injectHeroFinder();injectCategoryRail();injectCategoryAssist();enhanceImages();injectScrollProgress();revealSections();applyQueryToNativeSearch();keyboard();
    window.dispatchEvent(new CustomEvent('kleimpaul:ui-ready'));
  }

  window.addEventListener('kleimpaul:catalog',e=>{
    if(Array.isArray(e.detail?.rows)){
      const current=state.dynamic.filter(x=>x.category!==e.detail.category);state.dynamic=[...current,...e.detail.rows.map(x=>({...x,category:e.detail.category||PAGE}))];
    }
    setTimeout(enhanceCatalogSearch,0); setTimeout(applyQueryToNativeSearch,30);
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
