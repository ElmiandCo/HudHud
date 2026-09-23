(function(){
"use strict";

const KEY="hudhud_hq_state_v1";
const initial={projects:[],opportunities:[],connections:[],documents:[],activity:[]};
let state=load();

function load(){
  try { return Object.assign({},initial,JSON.parse(localStorage.getItem(KEY)||"{}")); }
  catch(e){ return Object.assign({},initial); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(state)); }
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(s){const t=document.getElementById("toast");if(!t)return;t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);}
function log(text){state.activity.unshift({text:text,at:new Date().toISOString()});state.activity=state.activity.slice(0,50);save();}
function nowLabel(){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date());}

function home(){
return '<section class="hero"><span class="eyebrow">HUDHUD CONVERSATION</span><h1>Welcome home.</h1><p>Talk to HudHud here. Your local AI connection is shown honestly below.</p><div class="chat card"><div id="messages" class="messages"><div class="message hud"><b>HUDHUD</b><span>I\'m here. What would you like to work on?</span></div></div><form id="chatForm" class="chat-form"><input id="chatInput" autocomplete="off" maxlength="1000" placeholder="Talk to HudHud…" aria-label="Message HudHud"><button class="primary" type="submit">Send</button></form><div id="brainStatus" class="chat-status">Checking local brain…</div></div></section><section class="grid" style="margin-top:45px"><div class="card"><div class="muted">PROJECTS</div><div class="metric">'+state.projects.length+'</div><div class="muted">Created in this workspace</div></div><div class="card"><div class="muted">OPPORTUNITIES</div><div class="metric">'+state.opportunities.length+'</div><div class="muted">Added by you</div></div><div class="card"><div class="muted">ACTIVITY</div><div class="metric">'+state.activity.length+'</div><div class="muted">Real workspace events</div></div></section>';
}
function list(items,title,desc){
 if(!items.length)return '<div class="empty"><strong>'+title+'</strong>'+desc+'</div>';
 return '<div class="list">'+items.map(x=>'<div class="row"><div><h3>'+esc(x.name||x.text)+'</h3><p>'+esc(x.description||x.notes||x.details||((x.at)?new Date(x.at).toLocaleString():""))+'</p></div><span class="pill">'+esc(x.status||"Recorded")+'</span></div>').join("")+'</div>';
}
function projects(){return '<div class="section-head"><div><h2>Projects</h2><span class="muted">Start from zero.</span></div><button class="primary" data-action="new-project">＋ New project</button></div>'+list(state.projects,"No projects yet.","Create the first project and HudHud will keep it here.");}
function opportunities(){return '<div class="section-head"><div><h2>Opportunities</h2><span class="muted">Empty until you add something.</span></div><button class="primary" data-action="new-opportunity">＋ Add opportunity</button></div>'+list(state.opportunities,"No opportunities yet.","Only real opportunities go here.");}
function studio(){return '<div class="section-head"><div><h2>HudHud Studio</h2><span class="muted">Create files and generate video concepts from the same command center.</span></div></div><div class="studio-grid"><div class="card studio-card"><div class="studio-icon">▣</div><div class="muted">FILE GENERATOR</div><h3>Word document</h3><p>Test HudHud\'s file-generation pipeline with a real downloadable .docx file.</p><button class="primary" id="makeDocx">Generate “Hi” Word Doc</button><div id="docStatus" class="studio-status"></div></div><div class="card studio-card"><div class="studio-icon">▶</div><div class="muted">AI VIDEO GENERATOR</div><h3>Video Studio</h3><p>Describe a video and HudHud will eventually route the request to the configured video model.</p><textarea id="videoPrompt" class="studio-input" placeholder="Describe the video you want…"></textarea><button class="primary" id="videoGenerate">Generate video</button><div id="videoStatus" class="studio-status">Provider connection will be added to the tool router.</div></div></div><div class="card tool-note"><div class="muted">STUDIO PIPELINE</div><h3>Prompt → Generator → File / Video → Download</h3><p>Files can be generated directly by HudHud. Video generation will use a provider connection rather than putting an API key in the browser.</p></div>';}
function system(){return '<div class="section-head"><div><h2>HudHud System</h2><span class="muted">Control the local HudHud runtime from HQ.</span></div><span id="systemOverall" class="system-state">Checking…</span></div><div class="system-grid"><div class="card system-card"><div class="system-card-top"><span class="system-icon">🧠</span><div><div class="muted">LOCAL BRAIN</div><h3>GPT4All</h3><p id="systemGpt">Checking port 4891…</p></div></div><button class="primary system-btn" data-system-action="start-gpt4all">Start Brain</button></div><div class="card system-card"><div class="system-card-top"><span class="system-icon">🦉</span><div><div class="muted">BRIDGE</div><h3>HudHud Bridge</h3><p id="systemBridge">Checking port 8787…</p></div></div><button class="secondary system-btn" data-system-action="restart-bridge">Restart Bridge</button></div><div class="card system-card"><div class="system-card-top"><span class="system-icon">🌐</span><div><div class="muted">NETWORK</div><h3>Tailscale Funnel</h3><p id="systemTunnel">Checking…</p></div></div><button class="secondary system-btn" data-system-action="start-funnel">Start Tunnel</button></div></div><div class="card system-launch"><div><div class="muted">ONE BUTTON</div><h3>Bring HudHud Online</h3><p>Starts GPT4All, starts Tailscale, restores the Funnel, and verifies the local services.</p></div><button class="primary" data-system-action="start-everything">⚡ Start Everything</button></div><div class="card system-note"><div class="muted">SAFE COMMAND LAYER</div><h3>Only approved commands can run.</h3><p>The website cannot run arbitrary Terminal commands. It sends an authenticated request to your local HudHud Bridge, which only accepts fixed system actions.</p></div>';}


function connections(){return '<div class="section-head"><div><h2>Connections</h2><span class="muted">Only recorded connections appear here.</span></div><button class="primary" data-action="new-connection">＋ Add connection</button></div>'+list(state.connections,"No connections recorded.","Add the systems HudHud is actually connected to.");}
function documents(){return '<div class="section-head"><div><h2>Documents</h2><span class="muted">Fresh workspace — no documents loaded.</span></div></div><div class="empty"><strong>No documents.</strong>The file layer comes later.</div>';}
function activity(){return '<div class="section-head"><div><h2>Activity</h2><span class="muted">Real actions from this browser.</span></div><button class="danger" data-action="clear-activity">Clear activity</button></div>'+list(state.activity,"No activity yet.","Your real actions will appear here.");}
function core(){return '<div class="section-head"><div><h2>HudHud Core</h2><span class="muted">Identity and workspace settings.</span></div></div><div class="grid"><div class="card"><div class="muted">IDENTITY</div><h3>HudHud</h3><p>AI command headquarters for Elmi Inc.</p></div><div class="card"><div class="muted">WORKSPACE</div><h3>Fresh</h3><p>Local browser state. No seeded business data.</p></div><div class="card"><div class="muted">DATE SOURCE</div><h3>System clock</h3><p>The date shown comes from the browser clock.</p></div></div><div class="card appearance-card"><div><div class="muted">APPEARANCE</div><h3>Day / Night</h3><p>Switch the visual theme instantly.</p></div><button id="themeToggle" class="theme-toggle" type="button"><span id="themeIcon">☾</span><span id="themeLabel">Night</span><i></i></button></div>';}

function projectForm(){return '<div class="section-head"><h2>New project</h2></div><form class="card form" id="projectForm"><label>Project name *</label><input name="name" required maxlength="100"><label>Description</label><textarea name="description" maxlength="500"></textarea><label>Status</label><select name="status"><option>Planning</option><option>Active</option><option>On hold</option></select><div class="form-actions"><button type="submit" class="primary">Create project</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';}
function opportunityForm(){return '<div class="section-head"><h2>New opportunity</h2></div><form class="card form" id="oppForm"><label>Name *</label><input name="name" required maxlength="100"><label>Notes</label><textarea name="notes" maxlength="500"></textarea><div class="form-actions"><button class="primary">Save opportunity</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';}
function connectionForm(){return '<div class="section-head"><h2>Add connection</h2></div><form class="card form" id="connForm"><label>System *</label><input name="name" required maxlength="80" placeholder="GitHub, Vercel, Supabase..."><label>Details</label><input name="details" maxlength="150"><div class="form-actions"><button class="primary">Save connection</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';}

function render(view){
 document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const m=document.getElementById("main");
 if(!m)return;
 const pages={home:home,projects:projects,opportunities:opportunities,connections:connections,tools:tools,studio:studio,documents:documents,activity:activity,core:core,system:system};
 m.innerHTML=(pages[view]||home)();
 bind(view);
 if(view==="home") bindChat();
 if(view==="core") bindThemeToggle();
 if(view==="studio") bindStudio();
 if(view==="system") bindSystem();
}

function bind(view){
 document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));
 document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{
   const a=b.dataset.action;
   if(a==="new-project"){document.getElementById("main").innerHTML=projectForm();bind(view);}
   if(a==="new-opportunity"){document.getElementById("main").innerHTML=opportunityForm();bind(view);}
   if(a==="new-connection"){document.getElementById("main").innerHTML=connectionForm();bind(view);}
   if(a==="cancel")render(view);
   if(a==="clear-activity"){state.activity=[];save();render("activity");}
 });
 const pf=document.getElementById("projectForm");
 if(pf)pf.onsubmit=e=>{e.preventDefault();const f=new FormData(pf),name=String(f.get("name")).trim();if(!name)return;state.projects.unshift({name:name,description:String(f.get("description")).trim(),status:String(f.get("status")),createdAt:new Date().toISOString()});log("Created project: "+name);toast("Project created");render("projects");};
 const of=document.getElementById("oppForm");
 if(of)of.onsubmit=e=>{e.preventDefault();const f=new FormData(of),name=String(f.get("name")).trim();if(!name)return;state.opportunities.unshift({name:name,notes:String(f.get("notes")).trim(),createdAt:new Date().toISOString()});log("Added opportunity: "+name);toast("Opportunity saved");render("opportunities");};
 const cf=document.getElementById("connForm");
 if(cf)cf.onsubmit=e=>{e.preventDefault();const f=new FormData(cf),name=String(f.get("name")).trim();if(!name)return;state.connections.unshift({name:name,details:String(f.get("details")).trim(),status:"Recorded",createdAt:new Date().toISOString()});log("Recorded connection: "+name);toast("Connection recorded");render("connections");};
}

function addMessage(who,text,kind){
 const box=document.getElementById("messages");if(!box)return;
 const d=document.createElement("div");d.className="message "+kind;
 const b=document.createElement("b");b.textContent=who;
 const s=document.createElement("span");s.textContent=text;
 d.appendChild(b);d.appendChild(s);box.appendChild(d);box.scrollTop=box.scrollHeight;
}
async function sendToHudHud(message){
 const status=document.getElementById("brainStatus");
 const endpoint="/api/hudhud";
 try{
   status.innerHTML='<span class="thinking-feather" aria-hidden="true">🪶</span><span>HudHud is thinking…</span>';
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:message})});
   const raw=await r.text();
   let data={};try{data=JSON.parse(raw)}catch(e){}
   if(!r.ok)throw new Error(data.error||("HudHud API HTTP "+r.status));
   if(!data.reply)throw new Error("HudHud API returned no reply");
   addMessage("HudHud",data.reply.trim(),"hud");
   status.textContent="HUDHUD • connected";
 }catch(e){
   status.textContent="HUDHUD • connection unavailable";
   addMessage("SYSTEM","HudHud API: "+(e&&e.message?e.message:String(e)),"hud");
   console.error("HudHud API request failed",e);
 }
}
async function systemAction(action){const status=document.getElementById("systemOverall");if(status)status.textContent="Working…";try{const r=await fetch("/api/system-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:action})});const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch(e){}if(!r.ok)throw new Error(data.error||("System API HTTP "+r.status));toast(data.message||"Command sent");setTimeout(refreshSystem,1500);}catch(e){if(status)status.textContent="Action failed";toast("System: "+(e&&e.message?e.message:String(e)));}}
async function refreshSystem(){try{const r=await fetch("/api/system-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"health"})});const data=await r.json();const g=document.getElementById("systemGpt"),b=document.getElementById("systemBridge"),t=document.getElementById("systemTunnel"),o=document.getElementById("systemOverall");if(!g||!b||!t||!o)return;g.textContent=data.gpt4all?.online?"ONLINE • :4891":"OFFLINE • :4891";b.textContent="ONLINE • :8787";t.textContent=data.tailscale?.online?"FUNNEL ACTIVE":"NOT ACTIVE";const all=!!(data.gpt4all?.online&&data.tailscale?.online);o.textContent=all?"● ALL SYSTEMS ONLINE":"● SYSTEMS NEED ATTENTION";o.className="system-state "+(all?"good":"warn");}catch(e){const o=document.getElementById("systemOverall");if(o)o.textContent="CONTROL AGENT UNAVAILABLE";}}
function bindSystem(){document.querySelectorAll("[data-system-action]").forEach(b=>b.onclick=()=>systemAction(b.dataset.systemAction));refreshSystem();}

function bindChat(){
 const form=document.getElementById("chatForm");if(!form)return;
 const input=document.getElementById("chatInput");
 form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;addMessage("You",message,"user");input.value="";log("Sent message to HudHud: "+message);await sendToHudHud(message);};
 const status=document.getElementById("brainStatus");
 status.textContent="HUDHUD • ready";
}


function bindStudio(){
 const doc=document.getElementById("makeDocx"), ds=document.getElementById("docStatus");
 if(doc)doc.onclick=async()=>{try{ds.textContent="Generating…";const r=await fetch("/api/generate-doc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"HudHud Test",text:"Hi"})});if(!r.ok)throw new Error("HTTP "+r.status);const blob=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="HudHud-HI.docx";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);ds.textContent="Downloaded HudHud-HI.docx";log("Generated Word document: HudHud-HI.docx");}catch(e){ds.textContent="Generation failed: "+e.message;}};
 const vb=document.getElementById("videoGenerate"), vs=document.getElementById("videoStatus"), vp=document.getElementById("videoPrompt");
 if(vb)vb.onclick=async()=>{const prompt=vp.value.trim();if(!prompt){vs.textContent="Enter a video prompt first.";return;}vs.textContent="Video generation connection is not configured yet.";};
}

function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem("hudhud_theme",theme);}
function getTheme(){return localStorage.getItem("hudhud_theme")||"night";}
function bindThemeToggle(){const b=document.getElementById("themeToggle");if(!b)return;const current=getTheme();document.documentElement.dataset.theme=current;const label=document.getElementById("themeLabel"),icon=document.getElementById("themeIcon");if(label)label.textContent=current==="day"?"Day":"Night";if(icon)icon.textContent=current==="day"?"☀":"☾";b.onclick=()=>{const next=getTheme()==="night"?"day":"night";applyTheme(next);if(label)label.textContent=next==="day"?"Day":"Night";if(icon)icon.textContent=next==="day"?"☀":"☾";};}
function init(){
 const today=document.getElementById("today");if(today)today.textContent=nowLabel();
 document.querySelectorAll("#nav button").forEach(b=>b.addEventListener("click",()=>render(b.dataset.view)));
 render("home");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();