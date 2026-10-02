(function(){
"use strict";
const social=new Set(["tiktok","instagram","linkedin","youtube","x"]);
let sb=null,session=null;
const labels={tiktok:"TikTok",instagram:"Instagram",linkedin:"LinkedIn",youtube:"YouTube",x:"X"};
async function init(){
 const cfg=await fetch("/api/supabase-config",{cache:"no-store"}).then(r=>r.json());
 sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 session=(await sb.auth.getSession()).data.session;
 sb.auth.onAuthStateChange((_,s)=>session=s);
 document.addEventListener("submit",intercept,true);
}
function match(text){
 const t=text.toLowerCase();
 if(!/disconnect|remove|unlink/.test(t)||!/social|social media|accounts/.test(t))return null;
 const keep=(t.match(/except\s+([a-z0-9 ,&]+)/i)?.[1]||"").split(/,|\band\b|&/).map(x=>x.trim()).filter(Boolean);
 const keepProviders=new Set(keep.flatMap(x=>Object.keys(labels).filter(k=>x.includes(k))));
 const targets=[...social].filter(x=>!keepProviders.has(x));
 return targets.length?targets:null;
}
function intercept(e){
 const form=e.target;if(!form||form.id!=="chatForm")return;
 const input=form.querySelector("#chatInput"),text=input?.value.trim()||"",targets=match(text);
 if(!targets)return;
 e.preventDefault();e.stopImmediatePropagation();
 const list=targets.map(x=>labels[x]).join(", ");
 const h=document.createElement("div");h.id="ehDisconnectConfirm";h.innerHTML='<div class="eh-backdrop"></div><section class="eh-confirm"><button class="eh-x" data-close>×</button><span class="eh-warning">🔌</span><h2>Disconnect these social accounts?</h2><p>HudHud will disconnect <b>'+list+'</b> and stop syncing them. Any other social account you named to keep will remain connected. Stored data is not automatically deleted.</p><div class="eh-confirm-actions"><button class="secondary" data-close>Cancel</button><button class="eh-delete" data-confirm>Disconnect '+targets.length+' connection'+(targets.length===1?"":"s")+'</button></div></section>';
 document.body.appendChild(h);
 h.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>h.remove());
 h.querySelector("[data-confirm]").onclick=async()=>{
  const b=h.querySelector("[data-confirm]");b.disabled=true;b.textContent="Disconnecting…";
  const r=await fetch("/api/connection-disconnect",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(session?.access_token||"")},body:JSON.stringify({providers:targets})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){b.disabled=false;b.textContent="Try again";alert(d.error||"Disconnect failed.");return;}
  h.remove();input.value="";alert("Disconnected: "+targets.map(x=>labels[x]).join(", "));location.reload();
 };
}
window.addEventListener("load",()=>setTimeout(()=>init().catch(()=>{}),1200));
})();