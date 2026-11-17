// Keep the editable brand identity consistent across all public pages.
(async function(){
  try{
    const response=await fetch('/api/public/settings',{headers:{'Accept':'application/json'}});
    if(!response.ok)return;
    const data=await response.json(),settings=data.settings||{};
    if(settings.logo)document.querySelectorAll('[data-site-logo]').forEach(img=>{img.src=settings.logo;});
    if(settings.contactWhatsapp){
      const number=String(settings.contactWhatsapp).replace(/\D/g,'');
      if(number)document.querySelectorAll('[data-whatsapp-link]').forEach(link=>{link.href='https://wa.me/'+number;});
    }
  }catch(error){console.warn('Brand settings could not be loaded.',error);}
})();
