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
function ensureSteps(item){
 if(!Array.isArray(item.steps))item.steps=[];
 return item.steps;
}
function stepProgress(item){
 const steps=ensureSteps(item);
 const done=steps.filter(s=>s.done).length;
 return {done,total:steps.length};
}
function workspaceTabs(kind,activeCount,doneCount){
 const filter=kind==="project"?projectFilter:opportunityFilter;
 return '<div class="workspace-tabs">'+
   '<button class="'+(filter==="active"?"active":"")+'" data-workspace-filter="'+kind+'" data-filter="active">Active <span>'+activeCount+'</span></button>'+
   '<button class="'+(filter==="done"?"active":"")+'" data-workspace-filter="'+kind+'" data-filter="done">Done <span>'+doneCount+'</span></button>'+
   '<button class="'+(filter==="all"?"active":"")+'" data-workspace-filter="'+kind+'" data-filter="all">All <span>'+(activeCount+doneCount)+'</span></button>'+
 '</div>';
}
function workspaceCards(items,kind,filter){
 const filtered=items.filter(item=>{
   const isDone=item.status==="Done";
   return filter==="done"?isDone:filter==="active"?!isDone:true;
 });
 if(!filtered.length){
   return '<div class="empty workspace-empty"><strong>'+ (filter==="done"?"Nothing is done yet.":"No active "+(kind==="project"?"projects":"opportunities")+" yet.")+'</strong>'+
     (filter==="done"?"Finish every step on an item and it will move here automatically.":"Create one above and break it into clear steps.")+'</div>';
 }
 return '<div class="workspace-cards">'+filtered.map(item=>{
   const p=stepProgress(item);
   const percent=p.total?Math.round((p.done/p.total)*100):0;
   const stepsHtml=p.total?'<div class="workspace-steps">'+item.steps.map((step,index)=>
     '<button type="button" class="workspace-step '+(step.done?"done":"")+'" data-step-toggle="'+kind+'" data-item-id="'+esc(item.id)+'" data-step-index="'+index+'">'+
       '<span class="step-check">'+(step.done?"✓":"")+'</span><span>'+esc(step.name)+'</span>'+
     '</button>').join("")+'</div>':
     '<div class="no-steps">No steps defined for this '+(kind==="project"?"project":"opportunity")+'.</div>';
   return '<article class="workspace-card '+(item.status==="Done"?"is-done":"")+'">'+
     '<div class="workspace-card-head"><div><div class="muted">'+(kind==="project"?"PROJECT":"OPPORTUNITY")+'</div><h3>'+esc(item.name)+'</h3></div><span class="pill '+(item.status==="Done"?"pill-done":"")+'">'+esc(item.status||"Planning")+'</span></div>'+
     '<p class="workspace-description">'+esc(item.description||item.notes||"No description provided.")+'</p>'+
     '<div class="workspace-progress"><div><span>PROGRESS</span><strong>'+p.done+'/'+p.total+' steps</strong></div><div class="progress-track"><i style="width:'+percent+'%"></i></div></div>'+
     stepsHtml+
   '</article>';
 }).join("")+'</div>';
}
let projectFilter="active";
let opportunityFilter="active";
function projects(){
 const items=state.projects||[];
 const active=items.filter(x=>x.status!=="Done").length;
 const done=items.filter(x=>x.status==="Done").length;
 return '<div class="section-head"><div><span class="eyebrow">WORKSPACE</span><h2>Projects</h2><span class="muted">Give every project a description, a clear sequence of steps, and a visible finish line.</span></div><button class="primary" data-action="new-project">＋ New project</button></div>'+
 workspaceTabs("project",active,done)+
 workspaceCards(items,"project",projectFilter);
}
function opportunities(){
 const items=state.opportunities||[];
 const active=items.filter(x=>x.status!=="Done").length;
 const done=items.filter(x=>x.status==="Done").length;
 return '<div class="section-head"><div><span class="eyebrow">PIPELINE</span><h2>Opportunities</h2><span class="muted">Break each opportunity into steps and move it to Done automatically when the work is complete.</span></div><button class="primary" data-action="new-opportunity">＋ Add opportunity</button></div>'+
 workspaceTabs("opportunity",active,done)+
 workspaceCards(items,"opportunity",opportunityFilter);
}
function tools(){return '<div class="section-head"><div><h2>Tools</h2><span class="muted">HudHud\'s action layer — capabilities are separated from the brain.</span></div></div><div class="tool-grid">'+[
['GitHub','Code, repositories, issues, pull requests','READ + WRITE','Ready to wire'],
['Vercel','Projects, deployments, build status','READ + DEPLOY','Ready to wire'],
['Supabase','Database, auth, storage, Edge Functions','READ + WRITE','Ready to wire'],
['OpenClaw','Browser and computer-side actions','ACTION','Local bridge'],
['Files','Documents, project knowledge, memory','READ + WRITE','Planned'],
['Web','Fresh information and research','READ','Planned']
].map(x=>'<div class="tool-card"><div class="tool-top"><span class="tool-icon">✦</span><span class="tool-state">'+esc(x[3])+'</span></div><h3>'+esc(x[0])+'</h3><p>'+esc(x[1])+'</p><div class="tool-bottom"><span>'+esc(x[2])+'</span><span class="tool-dot"></span></div></div>').join('')+'</div><div class="card tool-note"><div class="muted">HUDHUD TOOL ROUTER</div><h3>One brain. Many tools.</h3><p>HudHud will decide which connection to use, execute the permitted action, inspect the result, and continue until the task is complete.</p></div>';}
function studio(){return '<div class="section-head"><div><h2>HudHud Studio</h2><span class="muted">Create files and generate video concepts from the same command center.</span></div></div><div class="studio-grid"><div class="card studio-card"><div class="studio-icon">▣</div><div class="muted">FILE GENERATOR</div><h3>Word document</h3><p>Test HudHud\'s file-generation pipeline with a real downloadable .docx file.</p><button class="primary" id="makeDocx">Generate “Hi” Word Doc</button><div id="docStatus" class="studio-status"></div></div><div class="card studio-card"><div class="studio-icon">▶</div><div class="muted">AI VIDEO GENERATOR</div><h3>Video Studio</h3><p>Describe a video and HudHud will eventually route the request to the configured video model.</p><textarea id="videoPrompt" class="studio-input" placeholder="Describe the video you want…"></textarea><button class="primary" id="videoGenerate">Generate video</button><div id="videoStatus" class="studio-status">Provider connection will be added to the tool router.</div></div></div><div class="card tool-note"><div class="muted">STUDIO PIPELINE</div><h3>Prompt → Generator → File / Video → Download</h3><p>Files can be generated directly by HudHud. Video generation will use a provider connection rather than putting an API key in the browser.</p></div>';}
function system(){return '<div class="section-head"><div><span class="eyebrow">HUDHUD CONTROL CENTER</span><h2>System Command Center</h2><span class="muted">Live runtime, connections, activity and concise operational updates.</span></div><div class="system-head-actions"><span id="systemOverall" class="system-state">CHECKING…</span><button class="secondary" data-system-refresh>↻ Refresh</button></div></div><div class="system-layout"><div><div class="analytics-grid"><div class="card analytics-card"><span class="muted">CONNECTED</span><strong id="metricConnected">—</strong><small>live services</small></div><div class="card analytics-card"><span class="muted">CHECK LATENCY</span><strong id="metricLatency">—</strong><small>last health cycle</small></div><div class="card analytics-card"><span class="muted">COMMANDS</span><strong id="metricCommands">0</strong><small>this session</small></div><div class="card analytics-card"><span class="muted">EVENTS</span><strong id="metricEvents">0</strong><small>recorded activity</small></div></div><div class="system-grid"><div class="card system-card"><div class="system-card-top"><span class="status-light status-unknown" id="lightGpt"></span><span class="system-icon">🧠</span><div><div class="muted">LOCAL BRAIN</div><h3>GPT4All</h3><p id="systemGpt">Checking port 4891…</p></div></div><button class="primary system-btn" data-system-action="start-gpt4all">Start Brain</button></div><div class="card system-card"><div class="system-card-top"><span class="status-light status-unknown" id="lightBridge"></span><span class="system-icon">🦉</span><div><div class="muted">BRIDGE</div><h3>HudHud Bridge</h3><p id="systemBridge">Checking port 8787…</p></div></div><button class="secondary system-btn" data-system-action="restart-bridge">Restart Bridge</button></div><div class="card system-card"><div class="system-card-top"><span class="status-light status-unknown" id="lightTunnel"></span><span class="system-icon">🌐</span><div><div class="muted">NETWORK</div><h3>Tailscale Funnel</h3><p id="systemTunnel">Checking…</p></div></div><button class="secondary system-btn" data-system-action="start-funnel">Start Tunnel</button></div></div><div class="card integrations-panel"><div class="panel-head"><div><div class="muted">INTEGRATIONS</div><h3>Tool Router Connections</h3></div><button class="secondary" data-connection-refresh>↻ Refresh</button></div><div class="integration-list"><div class="integration-row" data-live-connection="github"><span class="status-light status-unknown"></span><div><strong>GitHub</strong><small>Repos • files • issues</small></div><em>Checking…</em></div><div class="integration-row" data-live-connection="vercel"><span class="status-light status-unknown"></span><div><strong>Vercel</strong><small>Projects • deployments</small></div><em>Checking…</em></div><div class="integration-row" data-live-connection="supabase"><span class="status-light status-unknown"></span><div><strong>Supabase</strong><small>Tables • data</small></div><em>Checking…</em></div></div></div><div class="card system-launch"><div><div class="muted">ONE BUTTON</div><h3>Bring HudHud Online</h3><p>Starts GPT4All, starts Tailscale, restores the Funnel, and leaves the bridge under LaunchAgent control.</p></div><button class="primary" data-system-action="start-everything">⚡ Start Everything</button></div></div><aside class="live-rail"><div class="live-rail-head"><div><span class="eyebrow">LIVE UPDATE</span><h3>HudHud Brief</h3></div><span class="live-pulse"></span></div><div id="liveBrief" class="live-brief">Checking the system…</div><div class="brief-setting"><label>Update focus</label><select id="briefFocus"><option value="all">All systems</option><option value="runtime">Runtime only</option><option value="connections">Connections only</option><option value="activity">Activity only</option></select></div><div class="rail-section"><div class="rail-title">RECENT ACTIVITY</div><div id="liveActivity" class="live-activity"><div class="muted">Waiting for activity…</div></div></div><div class="rail-section"><div class="rail-title">LIVE SIGNALS</div><div class="signal-row"><span>Auto refresh</span><b>5s</b></div><div class="signal-row"><span>Last check</span><b id="lastCheckSignal">—</b></div></div></aside></div><div class="card system-note"><div class="muted">CONNECTION SETTINGS</div><h3>Credentials stay server-side.</h3><p>Connection status is controlled from HQ, while API keys and secrets remain in Vercel environment variables. HudHud never exposes them in the browser.</p></div>';}
function connections(){return '<div class="section-head"><div><span class="eyebrow">CONTROL / SETTINGS</span><h2>Connections</h2><span class="muted">Live connection state for the systems HudHud can use.</span></div><div class="connection-head-actions"><button class="secondary" data-connection-reconnect-all>↻ Attempt reconnect</button><button class="primary" data-connection-refresh>↻ Check all connections</button></div></div><div class="connection-summary card"><div><div class="muted">ACTIVE CONNECTIONS</div><strong id="activeConnectionCount">—</strong><span> live tool connections</span></div><div id="activeConnectionNames" class="active-connection-names">Checking…</div></div><div class="connection-control-grid"><div class="card connection-control-card"><span class="status-light status-unknown" data-conn-light="github"></span><div class="connection-logo">🐙</div><h3>GitHub</h3><p>Repositories, files, issues and commits.</p><div class="connection-status-line"><strong data-conn-status="github">Checking…</strong><span data-conn-detail="github">—</span></div><button class="secondary connection-reconnect" data-connection-reconnect="github">↻ Attempt reconnect</button></div><div class="card connection-control-card"><span class="status-light status-unknown" data-conn-light="vercel"></span><div class="connection-logo">▲</div><h3>Vercel</h3><p>Projects, deployments and runtime operations.</p><div class="connection-status-line"><strong data-conn-status="vercel">Checking…</strong><span data-conn-detail="vercel">—</span></div><button class="secondary connection-reconnect" data-connection-reconnect="vercel">↻ Attempt reconnect</button></div><div class="card connection-control-card"><span class="status-light status-unknown" data-conn-light="supabase"></span><div class="connection-logo">⚡</div><h3>Supabase</h3><p>Tables, data and backend services.</p><div class="connection-status-line"><strong data-conn-status="supabase">Checking…</strong><span data-conn-detail="supabase">—</span></div><button class="secondary connection-reconnect" data-connection-reconnect="supabase">↻ Attempt reconnect</button></div><div class="card connection-settings"><div><div class="muted">SITE CONTROL</div><h3>Connection state is managed here.</h3><p>Use <b>Check all connections</b> to refresh live state. Secrets are never entered or displayed in this browser; they stay server-side in Vercel.</p></div><div class="settings-badge"><span class="status-light status-good"></span> Secrets stay server-side</div></div><div class="card"><div class="muted">RECORDED CONNECTIONS</div><h3>Workspace notes</h3>'+list(state.connections,"No manual connections recorded.","Add a human-readable connection note if you want it tracked in your workspace.")+'</div>';}
function documents(){return '<div class="section-head"><div><h2>Documents</h2><span class="muted">Fresh workspace — no documents loaded.</span></div></div><div class="empty"><strong>No documents.</strong>The file layer comes later.</div>';}
function activity(){return '<div class="section-head"><div><h2>Activity</h2><span class="muted">Real actions from this browser.</span></div><button class="danger" data-action="clear-activity">Clear activity</button></div>'+list(state.activity,"No activity yet.","Your real actions will appear here.");}
function core(){return '<div class="section-head"><div><h2>HudHud Core</h2><span class="muted">Identity and workspace settings.</span></div></div><div class="grid"><div class="card"><div class="muted">IDENTITY</div><h3>HudHud</h3><p>AI command headquarters for Elmi Inc.</p></div><div class="card"><div class="muted">WORKSPACE</div><h3>Fresh</h3><p>Local browser state. No seeded business data.</p></div><div class="card"><div class="muted">DATE SOURCE</div><h3>System clock</h3><p>The date shown comes from the browser clock.</p></div></div><div class="card appearance-card"><div><div class="muted">APPEARANCE</div><h3>Day / Night</h3><p>Switch the visual theme instantly.</p></div><button id="themeToggle" class="theme-toggle" type="button"><span id="themeIcon">☾</span><span id="themeLabel">Night</span><i></i></button></div>';}

function stepOptions(){
 return Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+(i===0?" step":" steps")+'</option>').join("");
}
function stepBuilderFields(prefix,count){
 let html="";
 for(let i=0;i<count;i++)html+='<div class="step-name-field"><span>'+String(i+1).padStart(2,"0")+'</span><input name="step_'+i+'" maxlength="120" placeholder="Step '+(i+1)+' name" required></div>';
 return html;
}
function bindStepBuilder(prefix){
 const select=document.getElementById(prefix+"StepCount");
 const fields=document.getElementById(prefix+"StepFields");
 if(!select||!fields)return;
 const renderFields=()=>{fields.innerHTML=stepBuilderFields(prefix,Number(select.value)||1);};
 select.onchange=renderFields;
 renderFields();
}
function projectForm(){
 return '<div class="section-head"><div><span class="eyebrow">NEW PROJECT</span><h2>Build the project</h2><span class="muted">Describe the outcome, choose the number of steps, then name each step.</span></div></div>'+
 '<form class="card form workspace-form" id="projectForm">'+
 '<label>Project name *</label><input name="name" required maxlength="100" placeholder="Fix Everything">'+
 '<label>Description *</label><textarea name="description" required maxlength="1000" placeholder="What is this project trying to accomplish?"></textarea>'+
 '<label>Starting status</label><select name="status"><option>Planning</option><option>Active</option><option>On hold</option></select>'+
 '<label>Number of steps *</label><select id="projectStepCount" name="stepCount">'+stepOptions()+'</select>'+
 '<div class="step-builder"><div class="step-builder-head"><span>STEP PLAN</span><small>Name each step in the order it should happen.</small></div><div id="projectStepFields" class="step-builder-fields"></div></div>'+
 '<div class="form-actions"><button type="submit" class="primary">Create project</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';
}
function opportunityForm(){
 return '<div class="section-head"><div><span class="eyebrow">NEW OPPORTUNITY</span><h2>Build the opportunity</h2><span class="muted">Capture the opportunity and turn the pursuit into a sequence of steps.</span></div></div>'+
 '<form class="card form workspace-form" id="oppForm">'+
 '<label>Opportunity name *</label><input name="name" required maxlength="100" placeholder="State Power Platform Contract">'+
 '<label>Description *</label><textarea name="description" required maxlength="1000" placeholder="What is the opportunity and what are we trying to win?"></textarea>'+
 '<label>Starting status</label><select name="status"><option>Open</option><option>Active</option><option>On hold</option></select>'+
 '<label>Number of steps *</label><select id="opportunityStepCount" name="stepCount">'+stepOptions()+'</select>'+
 '<div class="step-builder"><div class="step-builder-head"><span>PURSUIT PLAN</span><small>Name each step in the order it should happen.</small></div><div id="opportunityStepFields" class="step-builder-fields"></div></div>'+
 '<div class="form-actions"><button class="primary">Save opportunity</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';
}
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
 if(view==="connections") bindConnections();
}

function bind(view){
 document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));
 document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{
   const a=b.dataset.action;
   if(a==="new-project"){document.getElementById("main").innerHTML=projectForm();bind(view);bindStepBuilder("project");}
   if(a==="new-opportunity"){document.getElementById("main").innerHTML=opportunityForm();bind(view);bindStepBuilder("opportunity");}
   if(a==="new-connection"){document.getElementById("main").innerHTML=connectionForm();bind(view);}
   if(a==="cancel")render(view);
   if(a==="clear-activity"){state.activity=[];save();render("activity");}
 });
 document.querySelectorAll("[data-workspace-filter]").forEach(b=>b.onclick=()=>{
   const kind=b.dataset.workspaceFilter,filter=b.dataset.filter;
   if(kind==="project")projectFilter=filter; else opportunityFilter=filter;
   render(kind==="project"?"projects":"opportunities");
 });
 document.querySelectorAll("[data-step-toggle]").forEach(b=>b.onclick=()=>toggleWorkspaceStep(b.dataset.stepToggle,b.dataset.itemId,Number(b.dataset.stepIndex)));

 const pf=document.getElementById("projectForm");
 if(pf)pf.onsubmit=e=>{
   e.preventDefault();
   const f=new FormData(pf),name=String(f.get("name")).trim(),description=String(f.get("description")).trim();
   if(!name||!description)return;
   const count=Number(f.get("stepCount"))||1;
   const steps=Array.from({length:count},(_,i)=>({id:"step_"+Date.now()+"_"+i,name:String(f.get("step_"+i)||"").trim(),done:false}));
   if(steps.some(s=>!s.name)){toast("Name every project step");return;}
   state.projects.unshift({id:"project_"+Date.now(),name,description,status:String(f.get("status")),steps,createdAt:new Date().toISOString()});
   log("Created project: "+name+" with "+steps.length+" steps");
   toast("Project created");
   render("projects");
 };
 const of=document.getElementById("oppForm");
 if(of)of.onsubmit=e=>{
   e.preventDefault();
   const f=new FormData(of),name=String(f.get("name")).trim(),description=String(f.get("description")).trim();
   if(!name||!description)return;
   const count=Number(f.get("stepCount"))||1;
   const steps=Array.from({length:count},(_,i)=>({id:"step_"+Date.now()+"_"+i,name:String(f.get("step_"+i)||"").trim(),done:false}));
   if(steps.some(s=>!s.name)){toast("Name every opportunity step");return;}
   state.opportunities.unshift({id:"opportunity_"+Date.now(),name,description,status:String(f.get("status")),steps,createdAt:new Date().toISOString()});
   log("Added opportunity: "+name+" with "+steps.length+" steps");
   toast("Opportunity saved");
   render("opportunities");
 };
 const cf=document.getElementById("connForm");
 if(cf)cf.onsubmit=e=>{e.preventDefault();const f=new FormData(cf),name=String(f.get("name")).trim();if(!name)return;state.connections.unshift({name:name,details:String(f.get("details")).trim(),status:"Recorded",createdAt:new Date().toISOString()});log("Recorded connection: "+name);toast("Connection recorded");render("connections");};
}
function toggleWorkspaceStep(kind,itemId,index){
 const collection=kind==="project"?state.projects:state.opportunities;
 const item=collection.find(x=>x.id===itemId);
 if(!item)return;
 const steps=ensureSteps(item),step=steps[index];
 if(!step)return;
 step.done=!step.done;
 const allDone=steps.length>0&&steps.every(s=>s.done);
 if(allDone){
   if(item.status!=="Done")item.preDoneStatus=item.status||"Active";
   item.status="Done";
   log((kind==="project"?"Completed project":"Completed opportunity")+" step: "+item.name+" • "+step.name);
   toast((kind==="project"?"Project":"Opportunity")+" moved to Done");
 }else{
   if(item.status==="Done")item.status=item.preDoneStatus||"Active";
   log((step.done?"Completed ":"Reopened ")+(kind==="project"?"project":"opportunity")+" step: "+step.name);
   toast(step.done?"Step completed":"Step reopened");
 }
 item.updatedAt=new Date().toISOString();
 save();
 render(kind==="project"?"projects":"opportunities");
}

function addMessage(who,text,kind){
 const box=document.getElementById("messages");if(!box)return;
 const d=document.createElement("div");d.className="message "+kind;
 const b=document.createElement("b");b.textContent=who;
 const s=document.createElement("span");s.textContent=text;
 d.appendChild(b);d.appendChild(s);box.appendChild(d);box.scrollTop=box.scrollHeight;
}
function handleWorkspaceCommand(message){
 const text=String(message||"").trim();

 const statusUpdate=text.match(/\b(?:update|change|set)\s+(?:project\s*\\?:\s*|project\s+)([“"']?)([^”"']+?)\1(?:'s)?\s+status\s+(?:to|=)\s*[“"']?(planning|active|on hold)[”"']?/i);
 if(statusUpdate){
   const requestedName=String(statusUpdate[2]).trim().replace(/[.?!]+$/,"");
   const nextRaw=statusUpdate[3].toLowerCase();
   const nextStatus=nextRaw==="active"?"Active":nextRaw==="on hold"?"On hold":"Planning";
   const project=state.projects.find(p=>String(p.name||"").trim().toLowerCase()===requestedName.toLowerCase());
   if(!project)return {reply:"I couldn't find a project named “"+requestedName+"” in Projects."};
   const previous=project.status||"Recorded";
   project.status=nextStatus;
   project.updatedAt=new Date().toISOString();
   log("Updated project status: "+project.name+" → "+nextStatus);
   save();
   return {reply:"Done. Project “"+project.name+"” is now “"+nextStatus+"”. (Previously “"+previous+"”.)"};
 }

 const createMatch=text.match(/\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named|titled)\s+[“"']([^”"']+)[”"']/i);
 const looseMatch=text.match(/\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named|titled)\s+(.+?)(?:\s+(?:here|on this site|to this site))?$/i);
 const match=createMatch||looseMatch;
 if(!match)return null;
 let name=String(match[1]).trim().replace(/[.?!]+$/,"");
 if(!name)return null;
 const statusMatch=text.match(/\bstatus\s*[:=]?\s*(planning|active|on hold)\b/i);
 const rawStatus=statusMatch?statusMatch[1].toLowerCase():"planning";
 const status=rawStatus==="active"?"Active":rawStatus==="on hold"?"On hold":"Planning";
 const project={id:"project_"+Date.now(),name:name,description:"Created from the HudHud command center.",status:status,createdAt:new Date().toISOString()};
 state.projects.unshift(project);
 log("Created project from HudHud chat: "+name);
 return {reply:"Done. I created the project “"+name+"” with status “"+status+"”. It is now in Projects."};
}

async function sendToHudHud(message){
 const status=document.getElementById("brainStatus");
 const endpoint="/api/hudhud";
 try{
   status.innerHTML='<span class="thinking-feather" aria-hidden="true">🪶</span><span>HudHud is thinking…</span>';
   const workspaceAction=handleWorkspaceCommand(message);
   if(workspaceAction){
     addMessage("HudHud",workspaceAction.reply,"hud");
     status.textContent="HUDHUD • workspace action complete";
     toast("Project created");
     return;
   }
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
async function systemAction(action){const status=document.getElementById("systemOverall");if(status)status.textContent="Working…";liveStats.commands++;liveStats.lastCommand=new Date();log("System command: "+action);renderLiveStats();try{const r=await fetch("/api/system-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:action})});const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch(e){}if(!r.ok)throw new Error(data.error||("System API HTTP "+r.status));toast(data.message||"Command sent");setTimeout(refreshSystem,900);}catch(e){if(status)status.textContent="Action failed";toast("System: "+(e&&e.message?e.message:String(e)));}}
async function refreshSystem(){const started=Date.now();try{const results=await Promise.all([fetch("/api/system-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"health"})}),fetch("/api/connection-status",{cache:"no-store"})]);const data=await results[0].json(),connections=await results[1].json();const g=document.getElementById("systemGpt"),b=document.getElementById("systemBridge"),t=document.getElementById("systemTunnel"),o=document.getElementById("systemOverall");if(!g||!b||!t||!o)return;liveStats.checks++;liveStats.lastCheck=new Date();const runtime={gpt4all:!!data.gpt4all?.online,bridge:data.bridge?.online!==false,tailscale:!!data.tailscale?.online};g.textContent=runtime.gpt4all?"ONLINE • :4891":"OFFLINE • :4891";b.textContent=runtime.bridge?"ONLINE • :8787":"OFFLINE • :8787";t.textContent=runtime.tailscale?"FUNNEL ACTIVE":"NOT ACTIVE";setLight("lightGpt",runtime.gpt4all);setLight("lightBridge",runtime.bridge);setLight("lightTunnel",runtime.tailscale);const allRuntime=Object.values(runtime).every(Boolean);o.textContent=allRuntime?"● ALL SYSTEMS ONLINE":"● SYSTEMS NEED ATTENTION";o.className="system-state "+(allRuntime?"good":"warn");const checked=Object.values(connections.connections||{});const connected=checked.filter(x=>x.status==="connected").length+Object.values(runtime).filter(Boolean).length;const metric=document.getElementById("metricConnected");if(metric)metric.textContent=connected;const latency=document.getElementById("metricLatency");if(latency)latency.textContent=(connections.latencyMs??(Date.now()-started))+" ms";updateConnectionRows(connections.connections||{});renderLiveStats();}catch(e){const o=document.getElementById("systemOverall");if(o)o.textContent="CONTROL AGENT UNAVAILABLE";setLight("lightBridge",false);}}
let liveStats={checks:0,commands:0,lastCheck:null,lastCommand:null};
let healthTimer=null;
function setLight(id,on){const el=document.getElementById(id);if(el)el.className="status-light "+(on?"status-good":"status-bad");}
function updateConnectionRows(conns){
 const names=Object.keys(conns);
 const active=names.filter(name=>conns[name]?.status==="connected");
 const count=document.getElementById("activeConnectionCount");
 const list=document.getElementById("activeConnectionNames");
 if(count)count.textContent=active.length;
 if(list)list.innerHTML=active.length?active.map(name=>'<span class="active-chip"><i></i>'+esc(name.charAt(0).toUpperCase()+name.slice(1))+'</span>').join(""):'<span class="muted">No live tool connections yet.</span>';
 names.forEach(name=>{
   const d=conns[name]||{},status=d.status||"unknown";
   document.querySelectorAll("[data-live-connection=\""+name+"\"]").forEach(row=>{
     const light=row.querySelector(".status-light"),em=row.querySelector("em");
     if(light)light.className="status-light "+(status==="connected"?"status-good":status==="auth_error"?"status-warn":"status-bad");
     if(em)em.textContent=d.detail||status.replace("_"," ");
   });
   document.querySelectorAll("[data-conn-status=\""+name+"\"]").forEach(el=>el.textContent=status==="connected"?"CONNECTED":status==="auth_error"?"AUTH ERROR":status==="not_configured"?"NOT CONFIGURED":"OFFLINE");
   document.querySelectorAll("[data-conn-detail=\""+name+"\"]").forEach(el=>el.textContent=d.detail||"—");
   document.querySelectorAll("[data-conn-light=\""+name+"\"]").forEach(el=>el.className="status-light "+(status==="connected"?"status-good":status==="auth_error"?"status-warn":"status-bad"));
 });
}
function renderLiveStats(){const c=document.getElementById("metricCommands"),e=document.getElementById("metricEvents"),lc=document.getElementById("lastCheckSignal"),b=document.getElementById("liveBrief");if(c)c.textContent=liveStats.commands;if(e)e.textContent=state.activity.length;if(lc)lc.textContent=liveStats.lastCheck?liveStats.lastCheck.toLocaleTimeString():"—";const focus=document.getElementById("briefFocus")?.value||"all";if(b){if(focus==="runtime")b.textContent="Runtime watch: brain, bridge and tunnel are being checked every 5 seconds.";else if(focus==="connections")b.textContent="Connection watch: GitHub, Vercel and Supabase are being checked live.";else if(focus==="activity")b.textContent=state.activity[0]?.text||"No recent activity yet.";else b.textContent="Live control is active. HudHud is watching runtime, integrations and recent activity.";}const la=document.getElementById("liveActivity");if(la)la.innerHTML=state.activity.slice(0,6).map(x=>"<div class=\"live-event\"><span></span><div><strong>"+esc(x.text)+"</strong><small>"+new Date(x.at).toLocaleTimeString()+"</small></div></div>").join("")||"<div class=\"muted\">Waiting for activity…</div>";}
async function refreshConnections(){try{const r=await fetch("/api/connection-status",{cache:"no-store"});const data=await r.json();if(!r.ok)throw new Error(data.error||"Connection check failed");updateConnectionRows(data.connections||{});const latency=document.getElementById("metricLatency");if(latency)latency.textContent=(data.latencyMs??"—")+" ms";toast("Connections refreshed");}catch(e){toast("Connection check failed");}}
async function reconnectConnection(name,button){
 if(button){button.disabled=true;button.textContent="↻ Reconnecting…";}
 try{
   const r=await fetch("/api/connection-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({connection:name})});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Reconnect failed");
   const result=data.result||{};
   updateConnectionRows({[name]:result});
   if(result.status==="connected"){
     log("Reconnected "+name);
     toast(name.charAt(0).toUpperCase()+name.slice(1)+" connected");
   }else if(result.status==="not_configured"){
     toast(name.charAt(0).toUpperCase()+name.slice(1)+" needs server credentials");
   }else{
     toast(name.charAt(0).toUpperCase()+name.slice(1)+" is "+String(result.status).replace("_"," "));
   }
 }catch(e){toast("Reconnect failed: "+(e.message||e));}
 finally{if(button){button.disabled=false;button.textContent="↻ Attempt reconnect";}}
}
function bindConnections(){
 document.querySelectorAll("[data-connection-refresh]").forEach(b=>b.onclick=refreshConnections);
 document.querySelectorAll("[data-connection-reconnect]").forEach(b=>b.onclick=()=>reconnectConnection(b.dataset.connectionReconnect,b));
 document.querySelectorAll("[data-connection-reconnect-all]").forEach(b=>b.onclick=async()=>{
   b.disabled=true;b.textContent="↻ Reconnecting…";
   await Promise.all(["github","vercel","supabase"].map(name=>reconnectConnection(name)));
   await refreshConnections();
   b.disabled=false;b.textContent="↻ Attempt reconnect";
 });
 refreshConnections();
}
function bindSystem(){document.querySelectorAll("[data-system-action]").forEach(b=>b.onclick=()=>systemAction(b.dataset.systemAction));document.querySelectorAll("[data-system-refresh]").forEach(b=>b.onclick=refreshSystem);const focus=document.getElementById("briefFocus");if(focus){focus.value=localStorage.getItem("hudhud_brief_focus")||"all";focus.onchange=()=>{localStorage.setItem("hudhud_brief_focus",focus.value);renderLiveStats();};}renderLiveStats();refreshSystem();clearInterval(healthTimer);healthTimer=setInterval(refreshSystem,5000);}

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