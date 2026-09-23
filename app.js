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
function tools(){return '<div class="section-head"><div><h2>Tools</h2><span class="muted">HudHud\'s action layer — capabilities are separated from the brain.</span></div></div><div class="tool-grid">'+[
['GitHub','Code, repositories, issues, pull requests','READ + WRITE','Ready to wire'],
['Vercel','Projects, deployments, build status','READ + DEPLOY','Ready to wire'],
['Supabase','Database, auth, storage, Edge Functions','READ + WRITE','Ready to wire'],
['OpenClaw','Browser and computer-side actions','ACTION','Local bridge'],
['Files','Documents, project knowledge, memory','READ + WRITE','Planned'],
['Web','Fresh information and research','READ','Planned']
].map(x=>'<div class="tool-card"><div class="tool-top"><span class="tool-icon">✦</span><span class="tool-state">'+esc(x[3])+'</span></div><h3>'+esc(x[0])+'</h3><p>'+esc(x[1])+'</p><div class="tool-bottom"><span>'+esc(x[2])+'</span><span class="tool-dot"></span></div></div>').join('')+'</div><div class="card tool-note"><div class="muted">HUDHUD TOOL ROUTER</div><h3>One brain. Many tools.</h3><p>HudHud will decide which connection to use, execute the permitted action, inspect the result, and continue until the task is complete.</p></div>';}
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
 const pages={home:home,projects:projects,opportunities:opportunities,connections:connections,tools:tools,documents:documents,activity:activity,core:core};
 m.innerHTML=(pages[view]||home)();
 bind(view);
 if(view==="home") bindChat();
 if(view==="core") bindThemeToggle();
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
function bindChat(){
 const form=document.getElementById("chatForm");if(!form)return;
 const input=document.getElementById("chatInput");
 form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;addMessage("You",message,"user");input.value="";log("Sent message to HudHud: "+message);await sendToHudHud(message);};
 const status=document.getElementById("brainStatus");
 status.textContent="HUDHUD • ready";
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