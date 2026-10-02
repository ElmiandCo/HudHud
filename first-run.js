(function(){"use strict";
const KEY="hudhud_first_run_v1";
const VERSION=2;
const steps=[
{id:"brain",k:"01",title:"Your Brain",eyebrow:"YOUR BRAIN",why:"Choose how HudHud reasons with you. HudHud keeps the workspace, memory, permissions and connections; your Brain provides reasoning and generation.",know:"Brain/provider identity and configuration you authorize.",do:"Reason, generate, summarize and help select actions.",connect:"A configured Brain unlocks personalized AI workflows.",view:"connections"},
{id:"about",k:"02",title:"About You",eyebrow:"ABOUT YOU",why:"Give HudHud a starting picture so it can organize around what actually matters to you.",know:"The goals, work, projects and priorities you choose to share.",do:"Use that context in answers, planning and workspace organization.",connect:"Your answers become the starting point for LifeMap and observations.",view:"lifemap"},
{id:"work",k:"03",title:"Work",eyebrow:"WORK",why:"Connect the systems that run your work so HudHud can move from conversation into real workspace context.",know:"Authorized projects, repositories, deployments and work resources.",do:"Read permitted resources and perform supported actions.",connect:"Work connections can combine into project and execution intelligence.",view:"connections"},
{id:"social",k:"04",title:"Social",eyebrow:"SOCIAL",why:"Bring the accounts you want HudHud to understand. Multiple accounts can belong to the same provider.",know:"Only the profile, content and scopes you authorize.",do:"Supported providers can read or publish through approved permissions.",connect:"Social data can connect identity, content, audience and projects.",view:"social"},
{id:"finance",k:"05",title:"Finance",eyebrow:"FINANCE",why:"Connect financial sources when you want HudHud to understand authorized money information across accounts.",know:"Authorized balances, transactions or payment information, depending on the connector.",do:"Process permitted financial data and organize it for analysis.",connect:"Multiple financial accounts can contribute to one financial picture.",view:"premium"},
{id:"planning",k:"06",title:"Planning",eyebrow:"PLANNING",why:"Give HudHud a time dimension for what you are trying to accomplish.",know:"Authorized calendars, schedules and planning context.",do:"Use schedule information for planning and organization.",connect:"Calendar + goals + work context create planning intelligence.",view:"connections"},
{id:"contact",k:"07",title:"Communication",eyebrow:"COMMUNICATION",why:"Give HudHud a permitted way to reach people or services when a workflow actually needs it.",know:"Authorized contacts and communication metadata.",do:"Use supported communication tools after explicit permission.",connect:"Communication permissions can power Making Contact.",view:"connections"},
{id:"devices",k:"08",title:"Devices",eyebrow:"DEVICES",why:"Bring HudHud into the places you work and live. Start with what you actually own; nothing is connected automatically without authorization.",know:"Device type, platform, model and only the capabilities you authorize.",do:"Use supported device capabilities through the appropriate integration.",connect:"Devices extend HudHud beyond the browser into your connected environment.",view:"devices"}
];
const deviceCats=[
["🖥️","Desktop & Laptop","Operating System • Version • Language • Browsers"],
["📱","Mobile & Tablet","Manufacturer • Model • OS • Carrier • Browsers"],
["📺","Smart TV","TV platform, model and authorized capabilities"],
["💿","Smart Blu-Ray Players","Player platform, model and authorized capabilities"],
["📡","Set-Top Boxes & Streaming Devices","Streaming platform, model and authorized capabilities"],
["🎮","Gaming Consoles","Console platform, model and authorized capabilities"],
["⌚","Wearables","Wearable manufacturer, model and platform"],
["⌚","Smartwatches","Manufacturer • Model • watch OS • authorized health/activity signals"],
["🏠","Smart Home Devices","Home platform, device type, model and authorized controls"],
["🚗","Cars","Make • Model • year • connected-car capabilities"],
["🏍️","Motorcycles","Make • Model • year • connected capabilities"]
];
let client=null,shown=false,idx=0,completed=[],syncing=false;
const esc=s=>String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function getClient(){if(client)return client;const r=await fetch("/api/supabase-config",{cache:"no-store"}),d=await r.json();if(!r.ok||!d.url||!d.key)throw new Error("Supabase configuration unavailable");client=window.supabase.createClient(d.url,d.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client;}
function nav(view){const b=document.querySelector('#nav button[data-view="'+view+'"]');if(b){b.click();return true}return false}
function readLocal(){try{const p=JSON.parse(localStorage.getItem(KEY)||"null");return p?.version===VERSION&&Array.isArray(p.completed)?p.completed:[]}catch{return[]}}
function writeLocal(){localStorage.setItem(KEY,JSON.stringify({version:VERSION,completed:[...new Set(completed)],updatedAt:new Date().toISOString()}))}
function normalizeCompleted(value){return Array.isArray(value)?value.filter(id=>steps.some(s=>s.id===id)):[]}
function mergeProgress(remote,local){return [...new Set([...normalizeCompleted(remote),...normalizeCompleted(local)])].filter(id=>steps.some(s=>s.id===id))}
function nextIncomplete(){return steps.findIndex(s=>!completed.includes(s.id))}
async function persistProgress(markFinished=false){
 if(syncing)return;
 syncing=true;
 try{
  const c=await getClient();
  const data={hudhud_onboarding:{version:VERSION,completed:[...completed],updated_at:new Date().toISOString(),status:markFinished?"completed":"in_progress"}};
  if(markFinished)data.hudhud_onboarding_completed=true;
  await c.auth.updateUser({data});
 }catch(e){console.warn("HudHud onboarding progress could not sync",e)}
 finally{syncing=false}
}
function devicePanel(){return '<div class="hf-device-grid">'+deviceCats.map((d,i)=>'<button class="hf-device-cat" data-device-cat="'+i+'"><strong>'+d[0]+" "+d[1]+'</strong><small>'+d[2]+'</small><em>VIEW FIELDS</em></button>').join("")+'</div><div id="hfDeviceFields" class="hf-device-fields" hidden></div>'}
function render(){
 const s=steps[idx],doneCount=completed.length,pct=Math.round((doneCount/steps.length)*100),host=document.getElementById("hudhudFirstRun");if(!host)return;
 host.innerHTML='<div class="hf-dialog" role="dialog" aria-modal="true" aria-labelledby="hfTitle"><div class="hf-top"><div class="hf-brand"><img src="/assets/hudhud-logo.svg" alt="HudHud"><div><strong>HUDHUD HQ</strong><span>PERSONALIZED SETUP</span></div></div><button class="hf-close" data-hf-close aria-label="Close">×</button></div><div class="hf-body"><div class="hf-kicker">'+s.k+" • "+s.eyebrow+'</div><h1 class="hf-title" id="hfTitle">'+(doneCount?'Pick up where you left off.':'Welcome. Let’s build your HudHud.')+'</h1><p class="hf-copy">'+(doneCount?esc(doneCount)+" of "+steps.length+" setup areas are complete. HudHud will keep your progress and bring you back only to what is missing.":esc(s.why))+'</p><div class="hf-progress"><i style="width:'+pct+'%"></i></div><div class="hf-layout"><div class="hf-steps">'+steps.map((x,i)=>'<button class="hf-step '+(i===idx?"active ":"")+(completed.includes(x.id)?"done":"")+'" data-hf-step="'+i+'"><b>'+(completed.includes(x.id)?"✓":x.k)+'</b><span>'+esc(x.title)+'</span></button>').join("")+'</div><div class="hf-panel"><span class="hf-kicker">'+esc(s.eyebrow)+'</span><h2>'+esc(s.title)+(completed.includes(s.id)?' ✓':'')+'</h2><p class="hf-why">'+esc(s.why)+'</p>'+(s.id==="devices"?devicePanel():'<div class="hf-triad"><div><b>KNOW</b><p>'+esc(s.know)+'</p></div><div><b>DO</b><p>'+esc(s.do)+'</p></div><div><b>CONNECT</b><p>'+esc(s.connect)+'</p></div></div>')+'<div class="hf-actions"><button class="hf-secondary" data-hf-explore>Explore '+esc(s.title)+' →</button><button class="hf-primary" data-hf-next>'+(idx===steps.length-1?'Finish HudHud':'Mark complete & continue →')+'</button></div></div></div><div class="hf-footer"><span>🔐 Nothing is connected without your authorization.</span><button class="hf-skip" data-hf-later>Finish later</button></div></div></div>';
 host.querySelector("[data-hf-close]").onclick=finish;
 host.querySelector("[data-hf-later]").onclick=finish;
 host.querySelectorAll("[data-hf-step]").forEach(b=>b.onclick=()=>{idx=Number(b.dataset.hfStep);render()});
 host.querySelector("[data-hf-next]").onclick=next;
 host.querySelector("[data-hf-explore]").onclick=()=>{finish();nav(s.view)};
 host.querySelectorAll("[data-device-cat]").forEach(b=>b.onclick=()=>{const d=deviceCats[Number(b.dataset.deviceCat)],f=document.getElementById("hfDeviceFields");if(!f)return;f.hidden=false;const fields={"Desktop & Laptop":["Operating System","Operating System Version","Operating System Language","Browsers"],"Mobile & Tablet":["Handset Manufacturer","Handset Model","Handset Operating System","Wireless Carrier","Browsers"],"Smart TV":["Manufacturer","Model","Operating System","Apps / Capabilities"],"Smart Blu-Ray Players":["Manufacturer","Model","Operating System","Apps / Capabilities"],"Set-Top Boxes & Streaming Devices":["Manufacturer","Model","Platform","Apps / Capabilities"],"Gaming Consoles":["Manufacturer","Model","Operating System","Network / Gaming Services"],"Wearables":["Manufacturer","Model","Operating System","Sensors / Capabilities"],"Smartwatches":["Manufacturer","Model","Watch Operating System","Health / Activity Capabilities"],"Smart Home Devices":["Manufacturer","Model","Platform","Room / Device Type","Authorized Controls"],"Cars":["Manufacturer","Model","Year","Connected Services","Authorized Capabilities"],"Motorcycles":["Manufacturer","Model","Year","Connected Services","Authorized Capabilities"]};f.innerHTML='<strong>'+esc(d[1])+'</strong><div>'+((fields[d[1]]||[]).map(x=>'<span>• '+esc(x)+'</span>').join(""))+'</div>';});
}
function finish(){const host=document.getElementById("hudhudFirstRun");if(host){host.hidden=true;host.innerHTML=""}shown=false;writeLocal()}
async function next(){
 const id=steps[idx].id;
 if(!completed.includes(id))completed.push(id);
 writeLocal();
 await persistProgress(completed.length===steps.length);
 const n=nextIncomplete();
 if(n===-1){finish();nav("home");return}
 idx=n;
 render();
}
async function maybe(session){
 if(shown||!session?.user)return;
 const meta=session.user.user_metadata||{},remote=meta.hudhud_onboarding||{};
 completed=mergeProgress(remote.completed,readLocal());
 writeLocal();
 const n=nextIncomplete();
 if(n===-1){
  if(meta.hudhud_onboarding_completed!==true)await persistProgress(true);
  return;
 }
 idx=n;
 shown=true;
 const host=document.getElementById("hudhudFirstRun");
 if(host){host.hidden=false;render();}
}
async function boot(){
 if(!window.supabase?.createClient)return;
 try{
  const c=await getClient();
  const {data}=await c.auth.getSession();
  await maybe(data.session);
  c.auth.onAuthStateChange((_,s)=>setTimeout(()=>maybe(s),50));
 }catch(e){console.warn("HudHud first-run unavailable",e)}
}
window.addEventListener("load",()=>setTimeout(boot,250));
})();