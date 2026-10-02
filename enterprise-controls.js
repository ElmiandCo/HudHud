(function(){
"use strict";
const Q={
  brain:["What is HudHud's brain?","What does HudHud remember?","Can I change my Brain later?"],
  about:["Why does HudHud need this information?","What should I share?","Can I change this later?"],
  work:["What can HudHud do with this connection?","What information will HudHud receive?","Can I connect more than one account?"],
  social:["What will HudHud do with this account?","What information can HudHud see?","Can HudHud answer questions about this account?","Can I connect another account?"],
  finance:["What information will HudHud receive?","What does HudHud store?","What is live versus synced data?"],
  planning:["How does HudHud use my calendar?","How do Goals, Plans and Projects connect?","Can I change this later?"],
  contact:["What can HudHud access?","Can HudHud send messages for me?","What permissions are required?"],
  devices:["What can HudHud detect?","What can HudHud control?","Which device information is stored?"]
};
const providerNames={github:"GitHub",vercel:"Vercel",supabase:"Supabase",tiktok:"TikTok",instagram:"Instagram",linkedin:"LinkedIn",youtube:"YouTube",x:"X",stripe:"Stripe",google:"Google"};
let sb=null,session=null,seen=new Set(),poll=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function client(){
 if(sb)return sb;
 const r=await fetch("/api/supabase-config",{cache:"no-store"}),d=await r.json();
 sb=window.supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const s=await sb.auth.getSession();session=s.data.session;
 sb.auth.onAuthStateChange((_,x)=>{session=x;});
 return sb;
}
function token(){return session?.access_token||""}
function modal(id,html){let h=document.getElementById(id);if(!h){h=document.createElement("div");h.id=id;document.body.appendChild(h)}h.innerHTML=html;return h}
function close(id){const h=document.getElementById(id);if(h)h.innerHTML=""}
function currentStep(){
 const el=document.querySelector(".hf-panel .hf-kicker");
 const text=(el?.textContent||"").toLowerCase();
 return Object.keys(Q).find(k=>text.includes(k))||"social";
}
async function askHudHud(question,context){
 const h=modal("hudhudAskModal",`<div class="eh-backdrop" data-eh-close></div><section class="eh-ask" role="dialog" aria-modal="true">
 <button class="eh-x" data-eh-close aria-label="Close">×</button><div class="eh-ask-head"><img src="/assets/hudhud-logo.svg" alt="HudHud"><div><span>HUDHUD HELP</span><strong>Ask HudHud</strong></div></div>
 <div class="eh-chat" id="ehChat"><div class="eh-bubble hud"><b>HudHud</b><p>I'm looking at your current Get Started step. Ask me anything about it.</p></div></div>
 <form id="ehAskForm"><input id="ehAskInput" autocomplete="off" placeholder="Ask anything about this step…"><button>Send</button></form>
 </section>`);
 h.querySelectorAll("[data-eh-close]").forEach(x=>x.onclick=()=>close("hudhudAskModal"));
 const chat=h.querySelector("#ehChat"),input=h.querySelector("#ehAskInput");
 const add=(who,text,kind)=>{chat.insertAdjacentHTML("beforeend",`<div class="eh-bubble ${kind}"><b>${esc(who)}</b><p>${esc(text)}</p></div>`);chat.scrollTop=chat.scrollHeight};
 if(question)add("You",question,"user");
 if(question){
   const r=await fetch("/api/hudhud",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({message:`The user is in HudHud Get Started, step: ${context}. Answer this onboarding question clearly and only using authorized connection/capability context available to HudHud. Do not invent permissions. User question: ${question}`})});
   const d=await r.json().catch(()=>({}));add("HudHud",r.ok?(d.reply||"I don't have enough authorized information yet."):(d.error||"I couldn't answer that right now."),"hud");
 }
 h.querySelector("#ehAskForm").onsubmit=async e=>{e.preventDefault();const q=input.value.trim();if(!q)return;input.value="";add("You",q,"user");const r=await fetch("/api/hudhud",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({message:`The user is in HudHud Get Started, step: ${context}. Answer this onboarding question clearly and only using authorized connection/capability context available to HudHud. Do not invent permissions. User question: ${q}`})});const d=await r.json().catch(()=>({}));add("HudHud",r.ok?(d.reply||"I don't have enough authorized information yet."):(d.error||"I couldn't answer that right now."),"hud");};
 input.focus();
}
function renderAskButton(){
 const host=document.getElementById("hudhudFirstRun");if(!host||host.hidden||host.dataset.askBound==="1")return;
 host.dataset.askBound="1";
 const wrap=document.createElement("div");wrap.className="eh-ask-launch";wrap.innerHTML='<button type="button" aria-label="Ask HudHud for help"><img src="/assets/hudhud-logo.svg" alt=""><span>Ask HudHud</span></button>';
 host.appendChild(wrap);
 wrap.querySelector("button").onclick=()=>{
   const step=currentStep(), qs=Q[step]||Q.social;
   const h=modal("hudhudAskModal",`<div class="eh-backdrop" data-eh-close></div><section class="eh-ask eh-choice" role="dialog" aria-modal="true">
   <button class="eh-x" data-eh-close aria-label="Close">×</button><div class="eh-ask-head"><img src="/assets/hudhud-logo.svg" alt="HudHud"><div><span>CONTEXTUAL HELP</span><strong>Ask HudHud</strong></div></div>
   <p class="eh-muted">I'm here with you on <b>${esc(step)}</b>. Pick a question or ask your own.</p>
   <div class="eh-question-grid">${qs.map(q=>'<button data-eh-q="'+esc(q)+'">'+esc(q)+' <span>→</span></button>').join("")}</div>
   <button class="eh-type" data-eh-type>Ask something else…</button></section>`);
   h.querySelectorAll("[data-eh-close]").forEach(x=>x.onclick=()=>close("hudhudAskModal"));
   h.querySelectorAll("[data-eh-q]").forEach(x=>x.onclick=()=>askHudHud(x.dataset.ehQ,step));
   h.querySelector("[data-eh-type]").onclick=()=>askHudHud("",step);
 };
}
function connectionIcon(p){return ({github:"🐙",vercel:"▲",supabase:"⚡",tiktok:"♪",instagram:"◎",linkedin:"in",youtube:"▶",x:"𝕏",stripe:"💳",google:"G"}[p]||"🔗")}
async function showConnection(row){
 const provider=String(row.provider||"connection"),name=providerNames[provider]||provider;
 const md=row.metadata||{}, stats=md.stats||md;
 const facts=Object.entries(stats).filter(([k,v])=>["followers","following","likes","videos","subscribers","views","posts","repositories","deployments"].includes(k)&&v!=null).slice(0,6);
 const h=modal("hudhudConnectionResult",`<div class="eh-backdrop" data-eh-close></div><section class="eh-connection" role="dialog" aria-modal="true">
 <button class="eh-x" data-eh-close aria-label="Close">×</button><div class="eh-provider-hero"><div class="eh-provider-icon">${connectionIcon(provider)}</div><div><span>CONNECTION ACTIVE</span><h2>${esc(name)} connected</h2><p>${esc(row.display_name||row.account_handle||row.provider_account_id||"Authorized account")}</p></div></div>
 <div class="eh-connection-image">${md.avatar_url?'<img src="'+esc(md.avatar_url)+'" alt="">':'<img src="/assets/hudhud-logo.svg" alt="HudHud">'}<div><strong>HudHud successfully verified this connection.</strong><span>Authorized data is now available to relevant HudHud workflows.</span></div></div>
 <div class="eh-data-head"><span>WHAT HUDHUD RECEIVED</span><small>Initial sync</small></div>
 <div class="eh-data-grid">${facts.length?facts.map(([k,v])=>'<div><b>'+esc(String(v))+'</b><span>'+esc(k.replace(/_/g," "))+'</span></div>').join(""):'<div class="eh-data-empty"><b>Connection verified</b><span>Provider account and permissions are stored. Data will appear as the connector syncs.</span></div>'}</div>
 <div class="eh-capability"><span>🧠</span><div><b>What HudHud can do now</b><p>Use authorized data from this connection when relevant, answer questions about it, refresh supported information, and connect it to your Projects, Plans and Goals.</p></div></div>
 <div class="eh-connection-actions"><button class="secondary" data-eh-close>Finish later</button><button class="primary" data-eh-continue>Continue →</button></div>
 </section>`);
 h.querySelectorAll("[data-eh-close]").forEach(x=>x.onclick=()=>close("hudhudConnectionResult"));
 h.querySelector("[data-eh-continue]").onclick=()=>{close("hudhudConnectionResult");renderAskButton();};
}
async function watchConnections(){
 if(!session?.user||!sb)return;
 const {data}=await sb.from("hudhud_integrations").select("id,provider,status,display_name,account_handle,provider_account_id,metadata,connected_at,updated_at").eq("user_id",session.user.id).eq("status","connected").order("updated_at",{ascending:false}).limit(50);
 for(const row of data||[]){
   const key=row.id+":"+row.updated_at;
   if(!seen.has(key)){seen.add(key);if(row.connected_at&&Date.now()-new Date(row.connected_at).getTime()<900000)showConnection(row);}
 }
}
function accountModal(){
 return `<div class="eh-backdrop" data-eh-close></div><section class="eh-account" role="dialog" aria-modal="true">
 <button class="eh-x" data-eh-close aria-label="Close">×</button><div class="eh-account-head"><img src="/assets/hudhud-logo.svg" alt=""><div><span>ACCOUNT CONTROL</span><h2>Your HudHud account</h2><p>Pause services, manage billing, or permanently delete your account.</p></div></div>
 <div id="ehAccountBody"><div class="eh-loading">Loading account status…</div></div></section>`;
}
async function openAccount(){
 const h=modal("hudhudAccountModal",accountModal());h.querySelectorAll("[data-eh-close]").forEach(x=>x.onclick=()=>close("hudhudAccountModal"));
 const body=h.querySelector("#ehAccountBody");
 const r=await fetch("/api/account-lifecycle",{headers:{Authorization:"Bearer "+token()}}),d=await r.json().catch(()=>({}));
 if(!r.ok){body.innerHTML='<div class="eh-error">'+esc(d.error||"Could not load account status.")+"</div>";return;}
 body.innerHTML=`<div class="eh-account-status"><span class="eh-dot"></span><div><b>${esc(d.status||"active")}</b><small>Services and billing status</small></div></div>
 <div class="eh-account-grid"><div><span>Plan</span><b>${esc(d.plan||"Free")}</b></div><div><span>Billing</span><b>${esc(d.billingStatus||"No active subscription")}</b></div><div><span>Connections</span><b>${esc(d.connectionCount??0)}</b></div></div>
 <div class="eh-danger-actions"><button class="eh-suspend" data-eh-suspend>Pause HudHud</button><button class="eh-delete" data-eh-delete>Delete account</button></div>`;
 body.querySelector("[data-eh-suspend]").onclick=()=>confirmAccount("suspend");
 body.querySelector("[data-eh-delete]").onclick=()=>confirmAccount("delete");
}
function confirmAccount(action){
 const title=action==="suspend"?"Suspend HudHud?":"Delete your HudHud account?";
 const copy=action==="suspend"?"This pauses background processing, syncing, notifications and future billing while keeping your data so you can return.":"This permanently removes your HudHud profile and stored data. Connections are revoked/removed and active billing is canceled. This cannot be undone.";
 const h=modal("hudhudAccountConfirm",`<div class="eh-backdrop" data-eh-close></div><section class="eh-confirm" role="dialog" aria-modal="true"><button class="eh-x" data-eh-close>×</button><span class="eh-warning">⚠</span><h2>${title}</h2><p>${copy}</p><div class="eh-confirm-actions"><button class="secondary" data-eh-close>Cancel</button><button class="${action==="delete"?"eh-delete":"eh-suspend"}" data-eh-confirm>${action==="delete"?"Delete permanently":"Suspend account"}</button></div></section>`);
 h.querySelectorAll("[data-eh-close]").forEach(x=>x.onclick=()=>close("hudhudAccountConfirm"));
 h.querySelector("[data-eh-confirm]").onclick=async()=>{const b=h.querySelector("[data-eh-confirm]");b.disabled=true;b.textContent="Working…";const r=await fetch("/api/account-lifecycle",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({action})});const d=await r.json().catch(()=>({}));if(!r.ok){b.disabled=false;b.textContent=action==="delete"?"Delete permanently":"Suspend account";alert(d.error||"The account action could not be completed.");return;}close("hudhudAccountConfirm");close("hudhudAccountModal");await sb.auth.signOut();location.reload();};
}
function injectAccountButton(){
 const top=document.querySelector(".top-actions");if(!top||top.querySelector("[data-eh-account]"))return;
 const b=document.createElement("button");b.className="secondary eh-account-button";b.type="button";b.dataset.ehAccount="1";b.textContent="Account";b.onclick=()=>openAccount();top.insertBefore(b,top.firstChild);
}
function init(){
 client().then(()=>{injectAccountButton();renderAskButton();watchConnections();poll=setInterval(()=>{renderAskButton();watchConnections();},4000);}).catch(()=>{});
 const mo=new MutationObserver(()=>{injectAccountButton();renderAskButton();});mo.observe(document.body,{childList:true,subtree:true});
}
window.addEventListener("load",()=>setTimeout(init,900));
})();