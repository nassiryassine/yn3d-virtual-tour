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
  const tourSection=panoramas.length
   ? '<div class="virtual-viewer-wrap"><div id="virtual-pano" class="virtual-pano"><div class="pano-loading">Loading 360° experience…</div></div><div class="virtual-tour-toolbar"><div id="pano-scenes" class="pano-scenes" aria-label="Tour viewpoints"></div><div class="pano-controls"><button id="pano-zoom-out" type="button" aria-label="Zoom out">−</button><button id="pano-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="pano-reset" type="button" aria-label="Reset view">◎</button><button id="pano-fullscreen" type="button" aria-label="Fullscreen">⛶</button></div></div></div>'
   : '<div class="media-empty">An interactive 360° tour will appear here when panorama scenes are uploaded from the administration panel.</div>';
  root.innerHTML='<section class="project-hero"><p class="eyebrow">'+esc(p.category_name||'YN 3D PROJECT')+'</p><h1>'+esc(p.title)+'</h1><p class="project-description">'+esc(p.description||'Architectural visualization by YN 3D.')+'</p>'+(p.location?'<div class="project-location">'+esc(p.location)+'</div>':'')+'<a class="project-back" href="index.html#work">← BACK TO ALL PROJECTS</a></section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>GALLERY</em></h2><span>01 / IMAGES</span></div><div class="gallery-grid">'+gallery+'</div></section><section class="project-section"><div class="project-section-heading"><h2>PROJECT <em>VIDEOS</em></h2><span>02 / MOTION</span></div><div class="video-grid">'+videoSection+'</div></section><section class="project-section"><div class="project-section-heading"><h2>VIRTUAL <em>EXPERIENCE</em></h2><span>03 / 360° TOURS</span></div><div class="tour-grid">'+tourSection+'</div></section>';
  document.title=p.title+' | YN 3D';
  if(panoramas.length) initVirtualTour(panoramas);
 }catch(error){root.innerHTML='<div class="project-loading">'+esc(error.message)+'<p><a href="index.html">Back to portfolio</a></p></div>';}
 function initVirtualTour(items){
  const pano=document.getElementById('virtual-pano'),list=document.getElementById('pano-scenes');
  if(!window.Marzipano){pano.innerHTML='<div class="pano-loading">The 360° viewer could not load. Please refresh the page.</div>';return;}
  const viewer=new Marzipano.Viewer(pano,{controls:{mouseViewMode:'drag'}}),scenes=[];
  let active=null;
  const activate=item=>{active=item;item.scene.switchTo({transitionDuration:500});renderList();};
  const renderList=()=>{
   list.innerHTML='';
   scenes.forEach((item,index)=>{
    const btn=document.createElement('button');btn.type='button';btn.className='pano-scene-button'+(item===active?' active':'');btn.textContent='VIEWPOINT '+String(index+1).padStart(2,'0');btn.addEventListener('click',()=>activate(item));list.appendChild(btn);
   });
  };
  items.forEach((item,index)=>{
   const image=new Image();
   image.onload=()=>{
    const width=image.naturalWidth,geometry=new Marzipano.EquirectGeometry([{width}]);
    const source=Marzipano.ImageUrlSource.fromString(item.image_url);
    const limiter=Marzipano.RectilinearView.limit.traditional(width,120*Math.PI/180);
    const view=new Marzipano.RectilinearView({yaw:0,pitch:0,fov:Math.PI/2},limiter);
    const scene=viewer.createScene({source,geometry,view});
    scenes[index]={name:'Viewpoint '+(index+1),scene};
    if(scenes.filter(Boolean).length===items.length){scenes.forEach((entry,i)=>{
      const container=entry.scene.hotspotContainer();
      if(i<scenes.length-1){const next=scenes[i+1],el=document.createElement('button');el.className='tour-hotspot';el.type='button';el.textContent='➜';el.title='Next viewpoint';el.addEventListener('click',()=>activate(next));container.createHotspot(el,{yaw:0,pitch:-0.12});}
      if(i>0){const previous=scenes[i-1],el=document.createElement('button');el.className='tour-hotspot';el.type='button';el.textContent='←';el.title='Previous viewpoint';el.addEventListener('click',()=>activate(previous));container.createHotspot(el,{yaw:Math.PI,pitch:-0.12});}
    });activate(scenes[0]);}
   };
   image.onerror=()=>{pano.innerHTML='<div class="pano-loading">A panorama image could not be loaded.</div>';};
   image.src=item.image_url;
  });
  document.getElementById('pano-zoom-in').addEventListener('click',()=>{if(active)active.scene.view().setFov(Math.max(25*Math.PI/180,active.scene.view().fov()-8*Math.PI/180));});
  document.getElementById('pano-zoom-out').addEventListener('click',()=>{if(active)active.scene.view().setFov(Math.min(110*Math.PI/180,active.scene.view().fov()+8*Math.PI/180));});
  document.getElementById('pano-reset').addEventListener('click',()=>{if(active)active.scene.lookTo({yaw:0,pitch:0,fov:Math.PI/2},{transitionDuration:450});});
  document.getElementById('pano-fullscreen').addEventListener('click',()=>{if(pano.requestFullscreen)pano.requestFullscreen();});
 }
})();