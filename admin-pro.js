/* Kleimpaul — experiência administrativa complementar. */
(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const SECTIONS=[
    ['dashboard','Dashboard','Visão geral, indicadores e atalhos','fa-chart-line'],
    ['editor','Editor do site','Textos, imagens, links e estilos','fa-pen-ruler'],
    ['images','Imagens do site','Trocar imagens, banners e fundos visualmente','fa-images'],
    ['highlights','Destaques','Promoções e cards da página inicial','fa-star'],
    ['catalog','Catálogos','Produtos, preços e especificações','fa-layer-group'],
    ['inventory','Estoque','Produtos, quantidades, SKU e alertas','fa-boxes-stacked'],
    ['sales','Vendas & Notas','Clientes, orçamento, venda, recebimento e NF-e externa','fa-receipt'],
    ['media','Biblioteca de mídia','Imagens e referências para o site','fa-images'],
    ['chat','Chat interno','Comunicação da equipe','fa-comments'],
    ['trash','Lixeira','Itens removidos e restauração','fa-trash-can'],
    ['backup','Backup','Cópias, restauração e integridade','fa-cloud-arrow-up'],
    ['audit','Auditoria','Histórico de alterações','fa-clock-rotate-left'],
    ['settings','Configurações','Identidade visual e contatos','fa-gear']
  ];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

  function go(id){const b=$(`[data-go="${id}"]`);if(b){b.click();closePalette();}}

  function installTopSearch(){
    if($('.admin-global-search'))return;
    const top=$('.topbar'); const actions=$('.top-actions'); if(!top||!actions)return;
    const search=document.createElement('div');search.className='admin-global-search';search.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Buscar no painel..." aria-label="Buscar no painel"><kbd>Ctrl K</kbd><div class="admin-search-drop"></div>';
    top.insertBefore(search,actions); const input=$('input',search),drop=$('.admin-search-drop',search);
    const render=()=>{
      const q=norm(input.value.trim()); const rows=SECTIONS.filter(x=>!q||norm(`${x[1]} ${x[2]}`).includes(q));
      drop.innerHTML=rows.map(([id,title,desc,icon])=>`<button type="button" data-admin-result="${id}"><i class="fa-solid ${icon}"></i><span><strong>${title}</strong><small>${desc}</small></span><i class="fa-solid fa-arrow-right"></i></button>`).join('');
      drop.classList.toggle('show',document.activeElement===input);
      $$('[data-admin-result]',drop).forEach(b=>b.onclick=()=>go(b.dataset.adminResult));
    };
    input.addEventListener('focus',render);input.addEventListener('input',render);input.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('[data-admin-result]',drop);if(first){e.preventDefault();go(first.dataset.adminResult);}}if(e.key==='Escape'){input.blur();drop.classList.remove('show');}});
    document.addEventListener('click',e=>{if(!search.contains(e.target))drop.classList.remove('show');});
    window.KleimpaulAdminSearch=()=>{input.focus();input.select();render();};
  }

  function installQuickActions(){
    const hero=$('.hero-admin'); if(!hero||$('.admin-quick-actions'))return;
    const box=document.createElement('div');box.className='admin-quick-actions';
    box.innerHTML='<button data-quick="editor"><i class="fa-solid fa-pen-ruler"></i><span><strong>Editar site</strong><small>Alterar conteúdo</small></span></button><button data-quick="images"><i class="fa-solid fa-images"></i><span><strong>Trocar imagens</strong><small>Editor visual</small></span></button><button data-quick="catalog"><i class="fa-solid fa-plus"></i><span><strong>Novo produto</strong><small>Catálogo público</small></span></button><button data-quick="inventory"><i class="fa-solid fa-boxes-stacked"></i><span><strong>Estoque</strong><small>Consultar itens</small></span></button><button data-quick="sales"><i class="fa-solid fa-receipt"></i><span><strong>Nova venda</strong><small>Vendas & notas</small></span></button><button data-quick="backup"><i class="fa-solid fa-shield-halved"></i><span><strong>Backup</strong><small>Proteger dados</small></span></button>';
    hero.insertAdjacentElement('afterend',box); $$('[data-quick]',box).forEach(b=>b.onclick=()=>go(b.dataset.quick));
  }

  function groupSidebar(){
    const nav=$('#nav');if(!nav||nav.dataset.grouped)return;const buttons=$$('button[data-go]',nav);if(!buttons.length){setTimeout(groupSidebar,80);return;}
    nav.dataset.grouped='1';
    const before=(id,label)=>{const b=$(`[data-go="${id}"]`,nav);if(!b)return;const s=document.createElement('span');s.className='admin-nav-label';s.textContent=label;nav.insertBefore(s,b);};
    before('dashboard','Visão geral');before('editor','Conteúdo');before('inventory','Operação');before('sales','Comercial');before('backup','Segurança');before('settings','Sistema');
  }

  function keyboard(){document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();window.KleimpaulAdminSearch?.();}});}
  function closePalette(){const input=$('.admin-global-search input');const drop=$('.admin-search-drop');input?.blur();drop?.classList.remove('show');}

  function init(){installTopSearch();installQuickActions();groupSidebar();keyboard();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();
