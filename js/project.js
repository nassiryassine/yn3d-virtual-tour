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
  const gallery=photos.length?photos.map((m,i)=>'<figure class="gallery-item"><img src="'+esc(m.image_url)+'" alt="'+esc(p.title)+' — image '+(i+1)+'" data-gallery-index="'+i+'" role="button" tabindex="0" aria-label="View full image '+(i+1)+' of '+photos.length+'" loading="lazy"></figure>').join(''):'<div class="media-empty">Project photos will appear here once they are added from the administration panel.</div>';
  const videoSection=videos.length?videos.map(v=>videoMarkup(v.image_url)).join(''):'<div class="media-empty">Project videos will appear here when video links are added.</div>';
  const panoeeTours=media.filter(m=>m.image_type==='externalTour').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id);
  const validPanoeeTours=panoeeTours.filter(t=>{try{const u=new URL(t.image_url);return u.protocol==='https:'&&u.hostname==='tour.panoee.net'&&u.pathname.split('/').filter(Boolean).length>0;}catch{return false;}});
  const panoeeEmbedFor=t=>{try{const u=new URL(t.image_url),id=u.pathname.split('/').filter(Boolean).pop();if(!id)return '';return u.pathname.startsWith('/iframe/')?u.href:'https://tour.panoee.net/iframe/'+encodeURIComponent(id)+'?embedFullscreen=1&embedVr=1&embedGyro=1';}catch{return '';}};
  const tourCover=(p.cover_image||photos.find(m=>m.image_url)?.image_url||'');
  const tourSection=validPanoeeTours.length
   ? '<div class="panoee-tour-list">'+validPanoeeTours.map((t,i)=>'<button class="panoee-tour-card" type="button" data-panoee-index="'+i+'">'+(tourCover?'<img src="'+esc(tourCover)+'" alt="'+esc(p.title)+'" loading="lazy">':'<span class="panoee-tour-placeholder">YN 3D</span>')+'<span class="panoee-tour-shade"></span><span class="panoee-tour-label"><strong>360°</strong><span>'+esc(t.github_path||('جولة '+(i+1)))+'</span></span><span class="panoee-tour-play" aria-hidden="true">▶</span></button>').join('')+'</div><div class="panoee-lightbox" id="panoee-lightbox" aria-hidden="true"><div class="panoee-lightbox-panel" id="panoee-lightbox-panel" role="dialog" aria-modal="true" aria-label="Panoee virtual tour"><div class="panoee-lightbox-header"><span id="panoee-active-tour-title">360° VIRTUAL EXPERIENCE</span><button class="panoee-close" id="panoee-close" type="button" aria-label="Close virtual tour">×</button></div><div class="panoee-loading" id="panoee-loading"><span class="panoee-loader-ring"></span><span>PREPARING YOUR 360° EXPERIENCE</span></div><iframe class="panoee-embed-frame" id="panoee-embed-frame" title="360° virtual tour" src="about:blank" loading="eager" scrolling="no" allow="autoplay; accelerometer; gyroscope; fullscreen; xr-spatial-tracking" allowfullscreen></iframe></div></div>'
   : panoeeTours.length?'<div class="media-empty">رابط جولة Panoee غير صالح. يرجى مراجعته من لوحة الإدارة.</div>'
   : panoramas.length
     ? '<div class="panorama-gallery" id="panorama-gallery">'+panoramas.map((item,index)=>'<button class="panorama-thumb" type="button" data-pano-index="'+index+'" aria-label="Open 360 panorama '+(index+1)+'"><img src="'+esc(item.image_url)+'" alt="360° panorama '+(index+1)+'" loading="lazy"><span class="panorama-thumb-overlay"><strong>360°</strong><span>VIEW PANORAMA '+String(index+1).padStart(2,'0')+'</span></span></button>').join('')+'</div><div class="pano-lightbox" id="pano-lightbox" aria-hidden="true"><div class="pano-lightbox-panel" role="dialog" aria-modal="true" aria-label="Interactive 360 degree panorama"><div class="pano-lightbox-header"><span id="pano-view-title">360° VIRTUAL EXPERIENCE</span><button id="pano-close" class="pano-close" type="button" aria-label="Close viewer">×</button></div><div id="virtual-pano" class="virtual-pano"><div class="pano-loading">Loading 360° experience…</div></div><div class="virtual-tour-toolbar"><div id="pano-scenes" class="pano-scenes" aria-label="Tour viewpoints"></div><div class="pano-controls"><button id="pano-zoom-out" type="button" aria-label="Zoom out">−</button><button id="pano-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="pano-reset" type="button" aria-label="Reset view">◎</button><button id="pano-fullscreen" type="button" aria-label="Fullscreen">⛶</button></div></div></div></div>'
     : '<div class="media-empty">An interactive 360° tour will appear here when panorama scenes are uploaded from the administration panel.</div>';
  const projectAudio=media.find(m=>m.image_type==='projectAudio');
  const audioMarkup=projectAudio?'<div class="project-audio-player"><div class="audio-player-info"><span class="audio-player-kicker">YN 3D · SOUNDTRACK</span><strong>Project music</strong><span class="audio-player-status" id="audio-player-status">READY TO PLAY</span></div><button class="audio-play-button" id="audio-play-button" type="button" aria-label="Play music"><span id="audio-play-icon">▶</span></button><div class="audio-player-track"><div class="audio-track-times"><span id="audio-current-time">00:00</span><span id="audio-duration">00:00</span></div><input class="audio-progress" id="audio-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Music progress"></div><audio id="project-soundtrack" src="'+esc(projectAudio.image_url)+'" preload="metadata"></audio></div>':'';
  root.innerHTML='<section class="project-hero"><p class="eyebrow">'+esc(p.category_name||'YN 3D PROJECT')+'</p><h1>'+esc(p.title)+'</h1><p class="project-description">'+esc(p.description||'Architectural visualization by YN 3D.')+'</p>'+(p.location?'<div class="project-location">'+esc(p.location)+'</div>':'')+'<a class="project-back" href="index.html#work">← BACK TO ALL PROJECTS</a>'+audioMarkup+'</section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>GALLERY</em></h2><span>01 / IMAGES</span></div><div class="gallery-grid">'+gallery+'</div><div class="photo-lightbox" id="photo-lightbox" aria-hidden="true"><div class="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Project image viewer"><div class="photo-lightbox-header"><span id="photo-lightbox-count"></span><button id="photo-lightbox-close" class="photo-lightbox-close" type="button" aria-label="Close image viewer">×</button></div><div class="photo-lightbox-stage"><button id="photo-lightbox-prev" class="photo-lightbox-nav" type="button" aria-label="Previous image">‹</button><img id="photo-lightbox-image" alt=""><button id="photo-lightbox-next" class="photo-lightbox-nav" type="button" aria-label="Next image">›</button></div></div></div></section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>VIDEOS</em></h2><span>02 / MOTION</span></div><div class="video-grid">'+videoSection+'</div></section><section class="project-section"><div class="project-section-heading"><h2>VIRTUAL <em>EXPERIENCE</em></h2><span>03 / 360° TOURS</span></div><div class="tour-grid">'+tourSection+'</div></section>';
  document.title=p.title+' | YN 3D';
  if(photos.length) setupPhotoGallery(photos,p.title);
  if(validPanoeeTours.length)setupPanoeeViewer(validPanoeeTours);
  if(!validPanoeeTours.length&&!panoeeTours.length&&panoramas.length)setupVirtualTour(panoramas);
  const soundtrack=document.getElementById('project-soundtrack');
  if(soundtrack){
   const playButton=document.getElementById('audio-play-button'),playIcon=document.getElementById('audio-play-icon'),status=document.getElementById('audio-player-status'),progress=document.getElementById('audio-progress'),currentTime=document.getElementById('audio-current-time'),duration=document.getElementById('audio-duration');
   const formatTime=value=>{if(!Number.isFinite(value))return '00:00';const seconds=Math.floor(value);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');};
   const syncPlayer=()=>{const playing=!soundtrack.paused;playIcon.textContent=playing?'Ⅱ':'▶';playButton.setAttribute('aria-label',playing?'Pause music':'Play music');status.textContent=playing?'NOW PLAYING':soundtrack.ended?'PLAYBACK FINISHED':'READY TO PLAY';if(Number.isFinite(soundtrack.duration)){progress.value=soundtrack.duration?String(soundtrack.currentTime/soundtrack.duration*100):'0';duration.textContent=formatTime(soundtrack.duration);}currentTime.textContent=formatTime(soundtrack.currentTime);};
   playButton.addEventListener('click',()=>{if(soundtrack.paused)soundtrack.play().catch(()=>{status.textContent='TAP TO PLAY';});else soundtrack.pause();});
   soundtrack.addEventListener('loadedmetadata',syncPlayer);soundtrack.addEventListener('timeupdate',syncPlayer);soundtrack.addEventListener('play',syncPlayer);soundtrack.addEventListener('pause',syncPlayer);soundtrack.addEventListener('ended',syncPlayer);
   progress.addEventListener('input',()=>{if(Number.isFinite(soundtrack.duration))soundtrack.currentTime=(Number(progress.value)/100)*soundtrack.duration;});
   soundtrack.play().catch(()=>{status.textContent='TAP TO PLAY';});syncPlayer();
   window.addEventListener('pagehide',()=>{soundtrack.pause();soundtrack.currentTime=0;});
  }
 }catch(error){root.innerHTML='<div class="project-loading">'+esc(error.message)+'<p><a href="index.html">Back to portfolio</a></p></div>';}
 function setupPhotoGallery(items,title){
  const lightbox=document.getElementById('photo-lightbox');
  const image=document.getElementById('photo-lightbox-image');
  const count=document.getElementById('photo-lightbox-count');
  const previous=document.getElementById('photo-lightbox-prev');
  const next=document.getElementById('photo-lightbox-next');
  let currentIndex=0,lastFocused=null;
  const show=index=>{
   currentIndex=(index+items.length)%items.length;
   const item=items[currentIndex];
   image.src=item.image_url;
   image.alt=title+' — image '+(currentIndex+1);
   count.textContent=String(currentIndex+1).padStart(2,'0')+' / '+String(items.length).padStart(2,'0');
   previous.disabled=items.length<2;next.disabled=items.length<2;
  };
  const open=index=>{
   lastFocused=document.activeElement;
   show(index);
   lightbox.classList.add('open');lightbox.setAttribute('aria-hidden','false');
   document.body.classList.add('photo-viewer-open');
   document.getElementById('photo-lightbox-close').focus();
  };
  const close=()=>{
   lightbox.classList.remove('open');lightbox.setAttribute('aria-hidden','true');
   document.body.classList.remove('photo-viewer-open');
   image.removeAttribute('src');
   if(lastFocused&&lastFocused.focus)lastFocused.focus();
  };
  document.querySelector('.gallery-grid').addEventListener('click',event=>{
   const target=event.target.closest('[data-gallery-index]');if(target)open(Number(target.dataset.galleryIndex));
  });
  document.querySelector('.gallery-grid').addEventListener('keydown',event=>{
   const target=event.target.closest('[data-gallery-index]');
   if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open(Number(target.dataset.galleryIndex));}
  });
  previous.addEventListener('click',()=>show(currentIndex-1));
  next.addEventListener('click',()=>show(currentIndex+1));
  document.getElementById('photo-lightbox-close').addEventListener('click',close);
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)close();});
  document.addEventListener('keydown',event=>{
   if(!lightbox.classList.contains('open'))return;
   if(event.key==='Escape')close();
   else if(event.key==='ArrowLeft'){event.preventDefault();show(currentIndex-1);}
   else if(event.key==='ArrowRight'){event.preventDefault();show(currentIndex+1);}
  });
 }
 function setupPanoeeViewer(tours){
  const modal=document.getElementById('panoee-lightbox');
  const panel=document.getElementById('panoee-lightbox-panel');
  const frame=document.getElementById('panoee-embed-frame');
  const openButtons=document.querySelectorAll('[data-panoee-index]');
  const closeButton=document.getElementById('panoee-close');
  const activeTitle=document.getElementById('panoee-active-tour-title');
  if(!modal||!frame||!openButtons.length||!panel)return;
  const panoeeOrigin='https://tour.panoee.net';
  const panoeeEmbedFor=t=>{
   try{
    const u=new URL(t.image_url);
    if(u.protocol!=='https:'||u.hostname!=='tour.panoee.net')return '';
    const parts=u.pathname.split('/').filter(Boolean);
    const id=u.pathname.startsWith('/iframe/')?parts[1]:parts[parts.length-1];
    if(!id||!/^[A-Za-z0-9_-]+$/.test(id))return '';
    const embed=new URL('/iframe/'+encodeURIComponent(id),panoeeOrigin);
    embed.searchParams.set('embedFullscreen','1');
    embed.searchParams.set('embedVr','1');
    embed.searchParams.set('embedGyro','1');
    return embed.href;
   }catch{return '';}
  };
  let motionStarted=false,frameReady=false,frameRevealTimer=null;
  const relayParentMotion=event=>{
   if(!frameReady||!event.data||event.data.type!=='devicemotion'||event.source!==window.parent||!frame.contentWindow)return;
   try{frame.contentWindow.postMessage(event.data,panoeeOrigin);}catch(error){console.warn('Panoee parent motion bridge:',error);}
  };
  window.addEventListener('message',relayParentMotion,false);
  const relayMotion=event=>{
   if(!motionStarted||!frameReady||!frame.contentWindow)return;
   const vector=value=>value?{x:Number.isFinite(value.x)?value.x:null,y:Number.isFinite(value.y)?value.y:null,z:Number.isFinite(value.z)?value.z:null}:null;
   const rotation=value=>value?{alpha:Number.isFinite(value.alpha)?value.alpha:null,beta:Number.isFinite(value.beta)?value.beta:null,gamma:Number.isFinite(value.gamma)?value.gamma:null}:null;
   try{
    frame.contentWindow.postMessage({type:'devicemotion',deviceMotionEvent:{
     acceleration:vector(event.acceleration),
     accelerationIncludingGravity:vector(event.accelerationIncludingGravity),
     rotationRate:rotation(event.rotationRate),
     interval:typeof event.interval==='number'?event.interval:0,
     timeStamp:event.timeStamp
    }},panoeeOrigin);
   }catch(error){console.warn('Panoee motion bridge:',error);}
  };
  const enableMotion=async()=>{
   try{
    const Motion=window.DeviceMotionEvent;
    if(Motion&&typeof Motion.requestPermission==='function'){
     const permission=await Motion.requestPermission();
     if(permission!=='granted')return false;
    }
    if(window.DeviceOrientationEvent&&typeof window.DeviceOrientationEvent.requestPermission==='function'){
     const permission=await window.DeviceOrientationEvent.requestPermission();
     if(permission!=='granted')return false;
    }
    motionStarted=true;
    window.addEventListener('devicemotion',relayMotion,{passive:true});
    return true;
   }catch(error){
    console.warn('Device motion permission was not granted:',error);
    return false;
   }
  };
  const open=async(index)=>{
   const selected=tours[index];if(!selected)return;clearTimeout(frameRevealTimer);frameReady=false;modal.classList.remove('is-ready');frame.src=panoeeEmbedFor(selected);if(activeTitle)activeTitle.textContent=selected.github_path||('جولة '+(index+1));
   modal.classList.add('open');
   modal.setAttribute('aria-hidden','false');
   document.body.classList.add('panoee-viewer-open');
   const motionPermission=enableMotion();
   let fullscreenRequest=null;
   if(panel.requestFullscreen){
    try{fullscreenRequest=panel.requestFullscreen();}catch(error){/* Fullscreen may be blocked; modal remains full-window. */}
   }
   const enabled=await motionPermission;
   if(fullscreenRequest){try{await fullscreenRequest;}catch(error){/* Full-window modal remains available. */}}
   if(!enabled && (window.DeviceMotionEvent||window.DeviceOrientationEvent)){
    let notice=modal.querySelector('.panoee-motion-notice');
    if(!notice){notice=document.createElement('p');notice.className='panoee-motion-notice';notice.textContent='إذا لم تعمل حركة الهاتف، اسمح بالوصول إلى مستشعر الحركة من إعدادات المتصفح.';panel.appendChild(notice);}
   }
  };
  const close=async()=>{
   modal.classList.remove('open');
   modal.setAttribute('aria-hidden','true');
   document.body.classList.remove('panoee-viewer-open');
   motionStarted=false;
   window.removeEventListener('devicemotion',relayMotion);
   frameReady=false;clearTimeout(frameRevealTimer);modal.classList.remove('is-ready');
   frame.src='about:blank';
   if(document.fullscreenElement&&document.exitFullscreen){try{await document.exitFullscreen();}catch{}}
  };
  openButtons.forEach(button=>button.addEventListener('click',()=>open(Number(button.dataset.panoeeIndex))));
  closeButton.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('open'))close();});
  frame.addEventListener('load',()=>{frameReady=frame.src!=='about:blank';if(frameReady){clearTimeout(frameRevealTimer);frameRevealTimer=setTimeout(()=>{if(modal.classList.contains('open'))modal.classList.add('is-ready');},450);}});
 }
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