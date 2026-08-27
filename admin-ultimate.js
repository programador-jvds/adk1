(()=>{
  const $=id=>document.getElementById(id);
  const frame=()=>$('imgPreview');
  const selectedIndex=()=>{
    const active=document.querySelector('[data-img-index].active');
    return active?Number(active.dataset.imgIndex):-1;
  };
  const fmtRatio=(w,h)=>w&&h?(w/h).toFixed(2):'—';
  const fileName=src=>{try{return decodeURIComponent(new URL(src,location.href).pathname.split('/').pop()||'—')}catch{return String(src||'—').split('/').pop()}};

  function updateSelectedMeta(){
    const idx=selectedIndex();
    const btn=idx>=0?document.querySelector(`[data-img-index="${idx}"]`):null;
    const current=$('imgCurrentPreview');
    const src=$('imgCurrent')?.value||current?.src||'';
    let nw=current?.naturalWidth||0, nh=current?.naturalHeight||0;
    let rw=0,rh=0;
    if(btn){const sm=btn.querySelector('small')?.textContent||'';const m=sm.match(/(\d+)×(\d+)/);if(m){rw=Number(m[1]);rh=Number(m[2]);}}
    if($('imgMetaFile'))$('imgMetaFile').textContent=fileName(src);
    if($('imgMetaNatural'))$('imgMetaNatural').textContent=nw&&nh?`${nw} × ${nh}`:'carregando…';
    if($('imgMetaRendered'))$('imgMetaRendered').textContent=rw&&rh?`${rw} × ${rh}`:'—';
    if($('imgMetaRatio'))$('imgMetaRatio').textContent=nw&&nh?`${fmtRatio(nw,nh)}:1`:'—';
    if($('imgQualityHint')){
      let hint='Sem dados suficientes';
      if(nw&&nh&&rw&&rh){
        const low=nw<rw*.9||nh<rh*.9;
        const delta=Math.abs((nw/nh)-(rw/rh))/(nw/nh);
        hint=low?'Resolução abaixo do ideal':delta>.18?'Proporções bem diferentes — use cover/contain':'Proporção saudável';
      }
      $('imgQualityHint').value=hint;
    }
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-img-index]'))setTimeout(updateSelectedMeta,80)});
  $('imgCurrentPreview')?.addEventListener('load',updateSelectedMeta);
  $('imgNewPreview')?.addEventListener('load',()=>{
    const img=$('imgNewPreview'); if(!img)return;
    const box=img.closest('.image-compare-box');
    if(box&&$('imgAspect')?.value)box.style.aspectRatio=$('imgAspect').value;
  });

  document.querySelectorAll('[data-img-preset]').forEach(btn=>btn.addEventListener('click',()=>{
    const p=btn.dataset.imgPreset;
    const fit=$('imgFit'),aspect=$('imgAspect'),pos=$('imgPosition');
    if(p==='logo'){fit.value='contain';aspect.value='1 / 1';pos.value='center center'}
    if(p==='card'){fit.value='cover';aspect.value='4 / 3';pos.value='center center'}
    if(p==='banner'){fit.value='cover';aspect.value='16 / 9';pos.value='center center'}
    if(p==='story'){fit.value='cover';aspect.value='9 / 16';pos.value='center center'}
    if(p==='original'){fit.value='contain';aspect.value='';pos.value='center center'}
    document.querySelectorAll('.image-compare-box').forEach(box=>box.style.aspectRatio=aspect.value||'4 / 3');
  }));
  $('imgAspect')?.addEventListener('change',()=>document.querySelectorAll('.image-compare-box').forEach(box=>box.style.aspectRatio=$('imgAspect').value||'4 / 3'));

  // Preview por dispositivo + zoom.
  document.querySelectorAll('[data-preview-device]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-preview-device]').forEach(x=>x.classList.toggle('active',x===btn));
    frame()?.setAttribute('data-device',btn.dataset.previewDevice);
  }));
  $('previewZoom')?.addEventListener('input',e=>{
    const v=Number(e.target.value||100);if($('previewZoomValue'))$('previewZoomValue').textContent=`${v}%`;
    if(frame()){frame().style.transform=`scale(${v/100})`;frame().style.transformOrigin='top center';frame().style.marginBottom=`${Math.max(0,(v-100)*4)}px`;}
  });

  function getPreviewImages(){
    try{return [...frame().contentDocument.querySelectorAll('img')]}catch{return []}
  }
  function diagnosticRows(){
    const imgs=getPreviewImages();
    return imgs.map((img,i)=>{
      const r=img.getBoundingClientRect(),cs=frame().contentWindow.getComputedStyle(img),nw=img.naturalWidth||0,nh=img.naturalHeight||0;
      const low=nw&&nh&&(nw<r.width*.9||nh<r.height*.9);
      const ratioNat=nw&&nh?nw/nh:0, ratioBox=r.width&&r.height?r.width/r.height:0;
      const stretched=!!(ratioNat&&ratioBox&&Math.abs(ratioNat-ratioBox)/ratioNat>.16&&(!cs.objectFit||cs.objectFit==='fill'));
      const missingAlt=!String(img.alt||'').trim();
      return {i,img,nw,nh,rw:Math.round(r.width),rh:Math.round(r.height),low,stretched,missingAlt,src:img.currentSrc||img.src||'',label:img.alt||fileName(img.src)};
    });
  }
  let lastDiag=[];
  function renderDiagnostics(filter='all'){
    lastDiag=diagnosticRows();
    const total=lastDiag.length, low=lastDiag.filter(x=>x.low).length, alt=lastDiag.filter(x=>x.missingAlt).length, stretch=lastDiag.filter(x=>x.stretched).length;
    if($('diagTotal'))$('diagTotal').textContent=total;if($('diagLowRes'))$('diagLowRes').textContent=low;if($('diagAlt'))$('diagAlt').textContent=alt;if($('diagStretch'))$('diagStretch').textContent=stretch;
    let rows=lastDiag.filter(x=>filter==='alt'?x.missingAlt:filter==='low'?x.low:filter==='stretch'?x.stretched:(x.low||x.missingAlt||x.stretched));
    if(!rows.length&&filter==='all')rows=lastDiag.slice(0,8);
    const list=$('diagList');if(!list)return;
    list.innerHTML=rows.map(x=>{
      const issues=[x.low?'baixa resolução':'',x.missingAlt?'sem ALT':'',x.stretched?'possível distorção':''].filter(Boolean).join(' • ')||'sem alerta';
      return `<div class="diagnostic-item"><i class="fa-solid ${x.low?'fa-image':x.missingAlt?'fa-universal-access':x.stretched?'fa-up-right-and-down-left-from-center':'fa-circle-check'}"></i><div><strong>${escapeHtml(x.label||'Imagem')}</strong><small>${x.nw||'?'}×${x.nh||'?'} → ${x.rw}×${x.rh} • ${escapeHtml(issues)}</small></div><button class="btn gray sm" data-diag-src="${escapeAttr(x.src)}">Localizar</button></div>`;
    }).join('')||'<div class="note">Nenhum problema encontrado neste filtro.</div>';
    list.querySelectorAll('[data-diag-src]').forEach(b=>b.onclick=()=>locateBySrc(b.dataset.diagSrc));
  }
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeAttr=s=>escapeHtml(s);
  function locateBySrc(src){
    const buttons=[...document.querySelectorAll('[data-img-index]')];
    const hit=buttons.find(b=>b.querySelector('img')?.src===src||b.textContent.includes(fileName(src)));
    if(hit){hit.click();hit.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  $('runVisualDiagnostics')?.addEventListener('click',()=>renderDiagnostics('all'));
  $('diagRescan')?.addEventListener('click',()=>{ $('imgScan')?.click(); setTimeout(()=>renderDiagnostics('all'),1100);});
  $('diagMissingAlt')?.addEventListener('click',()=>renderDiagnostics('alt'));
  $('diagLarge')?.addEventListener('click',()=>renderDiagnostics('low'));
  $('diagResetFilter')?.addEventListener('click',()=>{if($('imgSearch')){$('imgSearch').value='';$('imgSearch').dispatchEvent(new Event('input'));}renderDiagnostics('all')});
  $('copyImageSelector')?.addEventListener('click',async()=>{const text=$('imgSelector')?.value||'';if(!text)return;try{await navigator.clipboard.writeText(text)}catch{}const b=$('copyImageSelector');const old=b.innerHTML;b.innerHTML='<i class="fa-solid fa-check"></i>Copiado';setTimeout(()=>b.innerHTML=old,1200)});

  // Teclas úteis no editor.
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&document.querySelector('[data-section="images"]')?.classList.contains('active')){e.preventDefault();$('imgSave')?.click();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&document.querySelector('[data-section="images"]')?.classList.contains('active')){e.preventDefault();renderDiagnostics('all');}
  });
})();
