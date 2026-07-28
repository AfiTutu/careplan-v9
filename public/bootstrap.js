(function(){
  let failed=false;
  function showStartupError(){
    if(failed)return; failed=true;
    document.body.classList.add('app-ready');
    const app=document.getElementById('app');
    if(!app)return;
    app.innerHTML='<main class="startup-error" role="alert"><h1>CarePlan could not start</h1><p>Your records have not been deleted. Close this tab, reopen CarePlan, and refresh once. If the problem continues, export browser site data before clearing storage.</p><button id="startupReload" type="button">Reload CarePlan</button></main>';
    document.getElementById('startupReload')?.addEventListener('click',()=>location.reload());
  }
  window.addEventListener('error',showStartupError,{once:true});
  window.addEventListener('unhandledrejection',showStartupError,{once:true});
  setTimeout(()=>{if(!document.body.classList.contains('app-ready'))showStartupError()},12000);
})();
