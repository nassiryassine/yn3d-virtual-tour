(async function(){
 const root=document.getElementById('project-content'),slug=new URLSearchParams(location.search).get('slug');
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 if(!slug){root.innerHTML='<div class="project-loading">Project link is missing. <a href="index.html">Back to portfolio</a></div>';return;}
 function videoMarkup(url){
  const safe=esc(url),yt=url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/),vm=url.match(/vimeo\.com\/(\d+)/);
  if(yt)return '<div class="video-item"><iframe src="https://www.youtube-nocookie.com/embed/'+yt[1]+'" title="Project video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
  if(vm)return '<div class="video-item"><iframe src="https://player.vimeo.com/video/'+vm[1]+'" title="Project video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>';
  if(/\.(mp4|webm|ogg)(\?.*)?$/i.test(url))return '<div class="video-item"><video controls preload="metadata" src="'+safe+'"></video></div>';
  return '<div class="media-empty">Unsupported video link format.</div>';
 }
 try{
  const response=await fetch('/api/public/projects/'+encodeURIComponent(slug)),data=await response.json();
  if(!response.ok)throw new Error(data.error||'Project not found');
  const p=data.project,media=data.media||[];
  const photos=media.filter(m=>['cover','gallery','image'].includes(String(m.image_type||'').toLowerCase()));
  const videos=media.filter(m=>String(m.image_type||'').toLowerCase()==='video');
  const panoramas=media.filter(m=>String(m.image_type||'').toLowerCase()==='tour360').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id);
  const gallery=photos.length?photos.map((m,i)=>'<figure class="gallery-item"><img src="'+esc(m.image_url)+'" alt="'+esc(p.title)+' — image '+(i+1)+'" loading="lazy"></figure>').join(''):'<div class="media-empty">Project photos will appear here once they are added from the administration panel.</div>';
  const videoSection=videos.length?videos.map(v=>videoMarkup(v.image_url)).join(''):'<div class="media-empty">Project videos will appear here when video links are added.</div>';
  const panoeeTour=media.find(m=>m.image_type==='externalTour');
  const panoeeEmbed=(()=>{
   if(!panoeeTour)return '';
   try{
    const url=new URL(panoeeTour.image_url);
    if(url.protocol!=='https:'||url.hostname!=='tour.panoee.net')return '';
    const id=url.pathname.split('/').filter(Boolean).pop();
    if(!id)return '';
    if(url.pathname.startsWith('/iframe/'))return url.href;
    return 'https://tour.panoee.net/iframe/'+encodeURIComponent(id)+'?embedFullscreen=1&embedVr=1&embedGyro=1';
   }catch{return '';}
  })();
  const tourSection=panoeeTour
   ? (panoeeEmbed
      ? '<div class="panoee-embed-wrap"><iframe class="panoee-embed-frame" title="360° virtual tour" src="'+esc(panoeeEmbed)+'" loading="lazy" scrolling="no" allow="autoplay; accelerometer; gyroscope; fullscreen; xr-spatial-tracking" allowfullscreen></iframe></div>'
      : '<div class="media-empty">رابط جولة Panoee غير صالح. يرجى مراجعته من لوحة الإدارة.</div>')
   : panoramas.length
     ? '<div class="panorama-gallery" id="panorama-gallery">'+panoramas.map((item,index)=>'<button class="panorama-thumb" type="button" data-pano-index="'+index+'" aria-label="Open 360 panorama '+(index+1)+'"><img src="'+esc(item.image_url)+'" alt="360° panorama '+(index+1)+'" loading="lazy"><span class="panorama-thumb-overlay"><strong>360°</strong><span>VIEW PANORAMA '+String(index+1).padStart(2,'0')+'</span></span></button>').join('')+'</div><div class="pano-lightbox" id="pano-lightbox" aria-hidden="true"><div class="pano-lightbox-panel" role="dialog" aria-modal="true" aria-label="Interactive 360 degree panorama"><div class="pano-lightbox-header"><span id="pano-view-title">360° VIRTUAL EXPERIENCE</span><button id="pano-close" class="pano-close" type="button" aria-label="Close viewer">×</button></div><div id="virtual-pano" class="virtual-pano"><div class="pano-loading">Loading 360° experience…</div></div><div class="virtual-tour-toolbar"><div id="pano-scenes" class="pano-scenes" aria-label="Tour viewpoints"></div><div class="pano-controls"><button id="pano-zoom-out" type="button" aria-label="Zoom out">−</button><button id="pano-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="pano-reset" type="button" aria-label="Reset view">◎</button><button id="pano-fullscreen" type="button" aria-label="Fullscreen">⛶</button></div></div></div></div>'
     : '<div class="media-empty">An interactive 360° tour will appear here when panorama scenes are uploaded from the administration panel.</div>'
  root.innerHTML='<section class="project-hero"><p class="eyebrow">'+esc(p.category_name||'YN 3D PROJECT')+'</p><h1>'+esc(p.title)+'</h1><p class="project-description">'+esc(p.description||'Architectural visualization by YN 3D.')+'</p>'+(p.location?'<div class="project-location">'+esc(p.location)+'</div>':'')+'<a class="project-back" href="index.html#work">← BACK TO ALL PROJECTS</a></section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>GALLERY</em></h2><span>01 / IMAGES</span></div><div class="gallery-grid">'+gallery+'</div></section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>VIDEOS</em></h2><span>02 / MOTION</span></div><div class="video-grid">'+videoSection+'</div></section><section class="project-section"><div class="project-section-heading"><h2>VIRTUAL <em>EXPERIENCE</em></h2><span>03 / 360° TOURS</span></div><div class="tour-grid">'+tourSection+'</div></section>';
  document.title=p.title+' | YN 3D';
  if(!panoeeTour && panoramas.length) setupVirtualTour(panoramas);
 }catch(error){root.innerHTML='<div class="project-loading">'+esc(error.message)+'<p><a href="index.html">Back to portfolio</a></p></div>';}
 function setupVirtualTour(items){
  const lightbox=document.getElementById('pano-lightbox'),pano=document.getElementById('virtual-pano'),list=document.getElementById('pano-scenes');
  let viewer=null,scenes=[],active=null,initPromise=null;
  const activate=item=>{
   if(!item)return;active=item;item.scene.switchTo({transitionDuration:450});
   document.querySelectorAll('.panorama-thumb').forEach((button,index)=>button.classList.toggle('active',index===item.index));
   document.getElementById('pano-view-title').textContent='360° — VIEWPOINT '+String(item.index+1).padStart(2,'0');
   list.querySelectorAll('button').forEach((button,index)=>button.classList.toggle('active',index===item.index));
  };
  const initialize=async()=>{
   if(!window.Marzipano){pano.innerHTML='<div class="pano-loading">The 360° viewer could not load. Please refresh the page.</div>';return;}
   viewer=new Marzipano.Viewer(pano,{controls:{mouseViewMode:'drag'}});
   const loaded=await Promise.all(items.map((item,index)=>new Promise(resolve=>{
    const image=new Image();
    const timeout=setTimeout(()=>resolve(null),30000);
    image.onload=()=>{
     clearTimeout(timeout);
     const width=image.naturalWidth,height=image.naturalHeight;
     if(!height||Math.abs(width/height-2)>0.04){resolve(null);return;}
     const geometry=new Marzipano.EquirectGeometry([{width}]);
     const source=Marzipano.ImageUrlSource.fromString(item.image_url);
     const limiter=Marzipano.RectilinearView.limit.traditional(width,120*Math.PI/180);
     const view=new Marzipano.RectilinearView({yaw:0,pitch:0,fov:Math.PI/2},limiter);
     resolve({index,name:'Viewpoint '+(index+1),scene:viewer.createScene({source,geometry,view})});
    };
    image.onerror=()=>{clearTimeout(timeout);resolve(null);};
    image.src=item.image_url;
   })));
   scenes=loaded.filter(Boolean);
   if(!scenes.length){pano.innerHTML='<div class="pano-loading">تعذر تحميل صور 360°. قد يكون رابط الصورة غير متاح أو حجمها كبيراً أو أبعادها ليست بنسبة 2:1. تحقق من اتصال الصور ثم أعد المحاولة.</div>';return;}
   list.innerHTML='';
   scenes.forEach(item=>{
    const btn=document.createElement('button');btn.type='button';btn.className='pano-scene-button';btn.textContent='VIEWPOINT '+String(item.index+1).padStart(2,'0');btn.addEventListener('click',()=>activate(item));list.appendChild(btn);
   });
   scenes.forEach((item,index)=>{
    const container=item.scene.hotspotContainer();
    if(index<scenes.length-1){const next=scenes[index+1],el=document.createElement('button');el.className='tour-hotspot';el.type='button';el.textContent='➜';el.title='Next viewpoint';el.addEventListener('click',()=>activate(next));container.createHotspot(el,{yaw:0,pitch:-0.12});}
    if(index>0){const previous=scenes[index-1],el=document.createElement('button');el.className='tour-hotspot';el.type='button';el.textContent='←';el.title='Previous viewpoint';el.addEventListener('click',()=>activate(previous));container.createHotspot(el,{yaw:Math.PI,pitch:-0.12});}
   });
   document.getElementById('pano-zoom-in').addEventListener('click',()=>{if(active)active.scene.view().setFov(Math.max(25*Math.PI/180,active.scene.view().fov()-8*Math.PI/180));});
   document.getElementById('pano-zoom-out').addEventListener('click',()=>{if(active)active.scene.view().setFov(Math.min(110*Math.PI/180,active.scene.view().fov()+8*Math.PI/180));});
   document.getElementById('pano-reset').addEventListener('click',()=>{if(active)active.scene.lookTo({yaw:0,pitch:0,fov:Math.PI/2},{transitionDuration:450});});
   document.getElementById('pano-fullscreen').addEventListener('click',()=>{if(pano.requestFullscreen)pano.requestFullscreen();});
  };
  const open=async index=>{
   lightbox.classList.add('open');lightbox.setAttribute('aria-hidden','false');document.body.classList.add('pano-viewer-open');
   if(!initPromise)initPromise=initialize();
   await initPromise;
   const selected=scenes.find(item=>item.index===index)||scenes[0];if(selected)activate(selected);
  };
  document.getElementById('panorama-gallery').addEventListener('click',event=>{
   const button=event.target.closest('[data-pano-index]');if(button)open(Number(button.dataset.panoIndex));
  });
  const close=()=>{lightbox.classList.remove('open');lightbox.setAttribute('aria-hidden','true');document.body.classList.remove('pano-viewer-open');};
  document.getElementById('pano-close').addEventListener('click',close);
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lightbox.classList.contains('open'))close();});
 }
})();