const menu=document.querySelector('.menu-toggle');if(menu){menu.addEventListener('click',()=>{const nav=document.querySelector('.site-header nav');if(nav){nav.style.display=nav.style.display==='flex'?'none':'flex';nav.style.position='absolute';nav.style.top='75px';nav.style.right='6vw';nav.style.background='#171717';nav.style.padding='22px';nav.style.flexDirection='column';nav.style.zIndex='20';}})}

// Load published portfolio projects from the public Worker API.
(async function loadPortfolioProjects(){
  const grid=document.getElementById('project-grid'); if(!grid)return;
  const count=document.getElementById('project-count');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  try{
    const response=await fetch('/api/public/projects',{headers:{'Accept':'application/json'}});
    if(!response.ok)throw new Error('Could not load projects');
    const data=await response.json(), projects=data.projects||[];
    if(count)count.textContent=String(projects.length).padStart(2,'0')+' PROJECTS';
    if(!projects.length){grid.innerHTML='<div class="projects-loading">New projects are coming soon.</div>';return;}
    grid.innerHTML=projects.map((p,index)=>{
      const href='project.html?slug='+encodeURIComponent(p.slug);
      const image=p.cover_image?'<img src="'+esc(p.cover_image)+'" alt="'+esc(p.title)+'" loading="lazy">':'<div class="project-fallback-image"></div>';
      return '<article class="project-card '+(index===0?'project-large':'')+'"><a href="'+href+'" class="project-image project-dynamic-image">'+image+'<span class="project-type">'+esc(p.category_name||'PROJECT')+'</span><span class="project-open">↗</span></a><div class="project-meta"><div><h3>'+esc(p.title)+'</h3><p>'+esc(p.location||p.description||'Explore project')+'</p></div><a href="'+href+'" class="project-arrow">VIEW PROJECT ↗</a></div></article>';
    }).join('');
  }catch(error){grid.innerHTML='<div class="projects-loading">Projects could not be loaded. Please refresh the page.</div>';console.error(error);}
})();


// Subtle reveal-on-scroll motion; keeps the portfolio content and links intact.
(function(){
  const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion)return;
  const targets=document.querySelectorAll('.hero-copy,.hero-visual,.intro > *, .section-heading, .project-card, .tour-cta > *, footer > *');
  if(!targets.length||!('IntersectionObserver' in window))return;
  document.body.classList.add('reveal-ready');
  targets.forEach((el,index)=>{
    el.setAttribute('data-reveal','');
    if(el.classList.contains('project-card'))el.style.setProperty('--reveal-delay',(index%2)*90+'ms');
  });
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.12,rootMargin:'0px 0px -35px 0px'});
  targets.forEach(el=>observer.observe(el));
})();
