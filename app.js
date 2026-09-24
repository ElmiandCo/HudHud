(function(){
"use strict";

const KEY="hudhud_hq_state_v1";
const initial={projects:[],opportunities:[],connections:[],documents:[],activity:[]};
let state=load();
let supabaseClient=null;
let currentUser=null;
let supabaseReady=null;
let authMode="signin";
let pendingView=null;
let legacyWorkspace=null;
let pendingWorkspaceMessage=null;
let projectConnections={};
let connectionResourceCache={};

function load(){
  try { return Object.assign({},initial,JSON.parse(localStorage.getItem(KEY)||"{}")); }
  catch(e){ return Object.assign({},initial); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(state)); }
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(s){const t=document.getElementById("toast");if(!t)return;t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);}
function log(text){const event={text:text,at:new Date().toISOString()};state.activity.unshift(event);state.activity=state.activity.slice(0,50);save();if(currentUser)cloudInsertActivity(text);}
function nowLabel(){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date());}

async function initSupabase(){
 if(supabaseReady)return supabaseReady;
 supabaseReady=(async()=>{
   const r=await fetch("/api/supabase-config",{cache:"no-store"});
   const cfg=await r.json();
   if(!r.ok)throw new Error(cfg.error||"Supabase configuration unavailable.");
   if(!window.supabase?.createClient)throw new Error("Supabase browser client did not load.");
   supabaseClient=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   supabaseClient.auth.onAuthStateChange((event,session)=>{
     setTimeout(()=>handleAuthSession(session),0);
   });
   const {data}=await supabaseClient.auth.getSession();
   await handleAuthSession(data.session);
   return supabaseClient;
 })();
 return supabaseReady;
}
function hasCloudUser(){return !!currentUser&&!!supabaseClient;}
async function handleAuthSession(session){
 const nextUser=session?.user||null;
 if(!nextUser){
   currentUser=null;
   state=Object.assign({},initial,{projects:[],opportunities:[],connections:[],documents:[],activity:[]});
   localStorage.removeItem(KEY);
   updateAuthUI();
   return;
 }
 const changed=!currentUser||currentUser.id!==nextUser.id;
 currentUser=nextUser;
 updateAuthUI();
 if(changed){
   const legacy=load();
   await loadCloudState();
   if(!state.projects.length&&!state.opportunities.length&&!state.connections.length&&(legacy.projects?.length||legacy.opportunities?.length||legacy.connections?.length)){
     legacyWorkspace=legacy;
     showImportPrompt();
   }
   if(pendingView){const v=pendingView;pendingView=null;render(v);}
   if(pendingWorkspaceMessage){const m=pendingWorkspaceMessage;pendingWorkspaceMessage=null;setTimeout(()=>sendToHudHud(m),0);}
 }
}
async function loadCloudState(){
 if(!hasCloudUser())return;
 const uid=currentUser.id;
 const [p,o,c,a,pc]=await Promise.all([
   supabaseClient.from("hudhud_projects").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
   supabaseClient.from("hudhud_opportunities").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
   supabaseClient.from("hudhud_connections").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
   supabaseClient.from("hudhud_activity").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(50),
   supabaseClient.from("hudhud_project_connections").select("*").eq("user_id",uid).order("created_at",{ascending:false})
 ]);
 const error=[p,o,c,a,pc].find(x=>x.error)?.error;
 if(error){console.error("HudHud cloud load failed",error);toast("Could not load your workspace");return;}
 state.projects=(p.data||[]).map(x=>({...x,createdAt:x.created_at,updatedAt:x.updated_at}));
 state.opportunities=(o.data||[]).map(x=>({...x,createdAt:x.created_at,updatedAt:x.updated_at}));
 state.connections=(c.data||[]).map(x=>({...x,createdAt:x.created_at,updatedAt:x.updated_at}));
 state.activity=(a.data||[]).map(x=>({text:x.text,at:x.created_at,id:x.id}));
 projectConnections={};
 (pc.data||[]).forEach(x=>{(projectConnections[x.project_id]||(projectConnections[x.project_id]=[])).push({...x,settings:x.settings||{}});});
 save();
}
async function importLegacyWorkspace(){
 if(!hasCloudUser()||!legacyWorkspace)return;
 const l=legacyWorkspace;
 const projects=(l.projects||[]).map(x=>({user_id:currentUser.id,name:x.name,description:x.description||"",status:x.status==="Done"?"Done":x.status||"Planning",steps:Array.isArray(x.steps)?x.steps:[],pre_done_status:x.preDoneStatus||null,created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()}));
 const opportunities=(l.opportunities||[]).map(x=>({user_id:currentUser.id,name:x.name,description:x.description||x.notes||"",status:x.status==="Done"?"Done":x.status||"Open",steps:Array.isArray(x.steps)?x.steps:[],pre_done_status:x.preDoneStatus||null,created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()}));
 const connections=(l.connections||[]).map(x=>({user_id:currentUser.id,name:x.name,details:x.details||"",status:x.status||"Recorded",created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()}));
 if(projects.length)await supabaseClient.from("hudhud_projects").insert(projects);
 if(opportunities.length)await supabaseClient.from("hudhud_opportunities").insert(opportunities);
 if(connections.length)await supabaseClient.from("hudhud_connections").insert(connections);
 await loadCloudState();
 legacyWorkspace=null;
 closeAuthModal();
 toast("Existing workspace imported");
}
async function cloudInsertProject(item){
 if(!hasCloudUser())return true;
 const {data,error}=await supabaseClient.from("hudhud_projects").insert({user_id:currentUser.id,name:item.name,description:item.description||"",status:item.status,steps:item.steps||[],pre_done_status:item.preDoneStatus||null,created_at:item.createdAt,updated_at:item.updatedAt||item.createdAt}).select().single();
 if(data?.id)item.id=data.id;
 if(error){toast("Project save failed");console.error(error);return false;} return true;
}
async function cloudUpdateProject(item){
 if(!hasCloudUser())return true;
 const {error}=await supabaseClient.from("hudhud_projects").update({name:item.name,description:item.description||"",status:item.status,steps:item.steps||[],pre_done_status:item.preDoneStatus||null,updated_at:item.updatedAt||new Date().toISOString()}).eq("id",item.id).eq("user_id",currentUser.id);
 if(error){toast("Project update failed");console.error(error);return false;} return true;
}
async function cloudInsertOpportunity(item){
 if(!hasCloudUser())return true;
 const {data,error}=await supabaseClient.from("hudhud_opportunities").insert({user_id:currentUser.id,name:item.name,description:item.description||"",status:item.status,steps:item.steps||[],pre_done_status:item.preDoneStatus||null,created_at:item.createdAt,updated_at:item.updatedAt||item.createdAt}).select().single();
 if(data?.id)item.id=data.id;
 if(error){toast("Opportunity save failed");console.error(error);return false;} return true;
}
async function cloudUpdateOpportunity(item){
 if(!hasCloudUser())return true;
 const {error}=await supabaseClient.from("hudhud_opportunities").update({name:item.name,description:item.description||"",status:item.status,steps:item.steps||[],pre_done_status:item.preDoneStatus||null,updated_at:item.updatedAt||new Date().toISOString()}).eq("id",item.id).eq("user_id",currentUser.id);
 if(error){toast("Opportunity update failed");console.error(error);return false;} return true;
}
async function cloudInsertConnection(item){
 if(!hasCloudUser())return true;
 const {data,error}=await supabaseClient.from("hudhud_connections").insert({user_id:currentUser.id,name:item.name,details:item.details||"",status:item.status||"Recorded",created_at:item.createdAt,updated_at:item.updatedAt||item.createdAt}).select().single();
 if(data?.id)item.id=data.id;
 if(error){toast("Connection save failed");console.error(error);return false;} return true;
}
async function cloudUpsertConnection(provider,settings,detail){
 if(!hasCloudUser())return null;
 const payload={user_id:currentUser.id,provider,name:provider.charAt(0).toUpperCase()+provider.slice(1),details:detail||"",status:"Configured",settings:settings||{},updated_at:new Date().toISOString()};
 const {data,error}=await supabaseClient.from("hudhud_connections").upsert(payload,{onConflict:"user_id,provider"}).select().single();
 if(error){console.error("Connection settings save failed",error);toast("Connection settings failed");return null;}
 const item={...data,createdAt:data.created_at,updatedAt:data.updated_at};
 const old=state.connections.findIndex(x=>x.provider===provider);
 if(old>=0)state.connections[old]=item;else state.connections.unshift(item);
 save();
 return item;
}
async function cloudSaveProjectConnections(projectId,rows){
 if(!hasCloudUser()||!projectId)return false;
 const {error:deleteError}=await supabaseClient.from("hudhud_project_connections").delete().eq("user_id",currentUser.id).eq("project_id",projectId);
 if(deleteError){console.error(deleteError);toast("Project connection update failed");return false;}
 if(rows.length){
   const {error}=await supabaseClient.from("hudhud_project_connections").insert(rows.map(x=>({user_id:currentUser.id,project_id:projectId,connection_id:x.connection_id,settings:x.settings||{}})));
   if(error){console.error(error);toast("Project connection update failed");return false;}
 }
 projectConnections[projectId]=rows;
 return true;
}
function projectConnectionRows(projectId){return projectConnections[projectId]||[];}
function selectedProjectConnections(projectId){
 return projectConnectionRows(projectId).map(row=>state.connections.find(c=>c.id===row.connection_id)||null).filter(Boolean).map(c=>({...c,projectSettings:projectConnectionRows(projectId).find(r=>r.connection_id===c.id)?.settings||{}}));
}
async function cloudInsertActivity(textValue){
 if(!hasCloudUser())return;
 const {error}=await supabaseClient.from("hudhud_activity").insert({user_id:currentUser.id,text:textValue});
 if(error)console.error("Activity save failed",error);
}
function updateAuthUI(){
 const buttons=document.querySelectorAll("[data-auth-start]");
 buttons.forEach(b=>{b.textContent=currentUser?"Open Workspace":"Get Started";});
 const top=document.getElementById("authUser");
 const account=document.getElementById("authAccountButton");
 if(top)top.textContent=currentUser?(currentUser.email||"Signed in"):"";
 if(account){
   account.textContent=currentUser?"Sign out":"Sign in";
   account.onclick=()=>currentUser?signOut():showAuthModal("signin");
 }
}
function authModalHtml(){
 return '<div class="auth-backdrop" data-auth-close></div><div class="auth-dialog" role="dialog" aria-modal="true"><button class="auth-close" data-auth-close>×</button><div class="eyebrow">HUDHUD ACCOUNT</div><h2>'+ (authMode==="signin"?"Welcome back":"Create your HudHud account") +'</h2><p class="auth-subtitle">'+(authMode==="signin"?"Sign in to access your private workspace.":"Create an account so your workspace belongs to you.")+'</p><div class="auth-tabs"><button class="'+(authMode==="signin"?"active":"")+'" data-auth-mode="signin">Sign in</button><button class="'+(authMode==="signup"?"active":"")+'" data-auth-mode="signup">Create account</button></div><form id="authForm"><label>Email</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"><label>Password</label><input name="password" type="password" autocomplete="'+(authMode==="signin"?"current-password":"new-password")+'" minlength="6" required placeholder="At least 6 characters">'+(authMode==="signup"?'<label>Confirm password</label><input name="confirm" type="password" autocomplete="new-password" minlength="6" required placeholder="Repeat your password">':"")+'<div id="authError" class="auth-error"></div><button class="primary auth-submit" type="submit">'+(authMode==="signin"?"Sign in":"Create account")+'</button></form><div class="auth-footer">'+(authMode==="signin"?"New to HudHud?":"Already have an account?")+' <button type="button" data-auth-mode="'+(authMode==="signin"?"signup":"signin")+'">'+(authMode==="signin"?"Create an account":"Sign in")+'</button></div></div>';
}
function showAuthModal(mode="signin"){
 authMode=mode;
 const modal=document.getElementById("authModal");if(!modal)return;
 modal.innerHTML=authModalHtml();modal.classList.add("show");modal.setAttribute("aria-hidden","false");
 bindAuthModal();
}
function closeAuthModal(){
 const modal=document.getElementById("authModal");if(!modal)return;
 modal.classList.remove("show");modal.setAttribute("aria-hidden","true");
}
function bindAuthModal(){
 const modal=document.getElementById("authModal");
 modal.querySelectorAll("[data-auth-close]").forEach(b=>b.onclick=closeAuthModal);
 modal.querySelectorAll("[data-auth-mode]").forEach(b=>b.onclick=()=>showAuthModal(b.dataset.authMode));
 const form=modal.querySelector("#authForm");
 if(form)form.onsubmit=async e=>{
   e.preventDefault();
   const f=new FormData(form),email=String(f.get("email")).trim(),password=String(f.get("password"));
   const errorEl=modal.querySelector("#authError"),submit=modal.querySelector(".auth-submit");
   if(errorEl)errorEl.textContent="";
   if(authMode==="signup"&&password!==String(f.get("confirm"))){if(errorEl)errorEl.textContent="Passwords do not match.";return;}
   submit.disabled=true;submit.textContent=authMode==="signin"?"Signing in…":"Creating account…";
   try{
     await initSupabase();
     const result=authMode==="signin"
       ?await supabaseClient.auth.signInWithPassword({email,password})
       :await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
     if(result.error)throw result.error;
     if(authMode==="signup"&&!result.data.session){
       if(errorEl)errorEl.textContent="Account created. Check your email to confirm your account, then sign in.";
       submit.disabled=false;submit.textContent="Create account";return;
     }
     closeAuthModal();
     toast("Signed in");
   }catch(err){if(errorEl)errorEl.textContent=err.message||"Authentication failed.";submit.disabled=false;submit.textContent=authMode==="signin"?"Sign in":"Create account";}
 };
}
function showImportPrompt(){
 const modal=document.getElementById("authModal");if(!modal||!legacyWorkspace)return;
 const p=legacyWorkspace.projects?.length||0,o=legacyWorkspace.opportunities?.length||0,c=legacyWorkspace.connections?.length||0;
 modal.innerHTML='<div class="auth-backdrop"></div><div class="auth-dialog import-dialog"><div class="eyebrow">WORKSPACE FOUND</div><h2>Import your existing workspace?</h2><p class="auth-subtitle">HudHud found '+p+' project(s), '+o+' opportunity(ies), and '+c+' connection(s) stored on this browser. Import them into your signed-in account?</p><div class="form-actions"><button class="primary" data-import-workspace>Import workspace</button><button class="secondary" data-skip-import>Start fresh</button></div></div>';
 modal.classList.add("show");modal.setAttribute("aria-hidden","false");
 modal.querySelector("[data-import-workspace]").onclick=async b=>{b.currentTarget.disabled=true;b.currentTarget.textContent="Importing…";await importLegacyWorkspace();};
 modal.querySelector("[data-skip-import]").onclick=()=>{legacyWorkspace=null;closeAuthModal();localStorage.removeItem(KEY);};
}
function requireAuth(view){
 if(currentUser)return true;
 pendingView=view;
 showAuthModal("signin");
 return false;
}
async function signOut(){
 if(supabaseClient)await supabaseClient.auth.signOut();
 currentUser=null;
 state=Object.assign({},initial,{projects:[],opportunities:[],connections:[],documents:[],activity:[]});
 localStorage.removeItem(KEY);
 toast("Signed out");
 render("home");
}

function home(){
return '<section class="hero"><span class="eyebrow">HUDHUD CONVERSATION</span><h1>Welcome home.</h1><p>Talk to HudHud here. Sign in to create and manage your own private projects, opportunities and connections.</p><div class="actions"><button class="primary" data-auth-start>Get Started</button></div><div class="chat card"><div id="messages" class="messages"><div class="message hud"><b>HUDHUD</b><span>I\'m here. What would you like to work on?</span></div></div><form id="chatForm" class="chat-form"><input id="chatInput" autocomplete="off" maxlength="1000" placeholder="Talk to HudHud…" aria-label="Message HudHud"><button class="primary" type="submit">Send</button></form><div id="brainStatus" class="chat-status">Checking local brain…</div></div></section><section class="grid" style="margin-top:45px"><div class="card"><div class="muted">PROJECTS</div><div class="metric">'+state.projects.length+'</div><div class="muted">Created in this workspace</div></div><div class="card"><div class="muted">OPPORTUNITIES</div><div class="metric">'+state.opportunities.length+'</div><div class="muted">Added by you</div></div><div class="card"><div class="muted">ACTIVITY</div><div class="metric">'+state.activity.length+'</div><div class="muted">Real workspace events</div></div></section>';
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
   const p=stepProgress(item),percent=p.total?Math.round((p.done/p.total)*100):0;
   const linked=selectedProjectConnections(item.id);
   const connectionHtml=kind==="project"?'<div class="project-connections"><div class="project-connections-head"><span>CONNECTIONS</span><button type="button" class="secondary mini-button" data-project-connections="'+esc(item.id)+'">⚙ Configure</button></div><div class="project-connection-chips">'+(linked.length?linked.map(c=>'<span class="project-chip">'+(c.provider==="github"?"🐙":c.provider==="vercel"?"▲":"⚡")+' '+esc(c.name)+'</span>').join(""):'<span class="muted">No connections selected.</span>')+'</div></div>':'';
   const stepsHtml=p.total?'<div class="workspace-steps">'+item.steps.map((step,index)=>
     '<div class="workspace-step-row"><button type="button" class="workspace-step '+(step.done?"done":"")+'" data-step-toggle="'+kind+'" data-item-id="'+esc(item.id)+'" data-step-index="'+index+'"><span class="step-check">'+(step.done?"✓":"")+'</span><span>'+esc(step.name)+'</span></button>'+
     (kind==="project"?'<button type="button" class="hudhud-step-button" title="Ask HudHud to complete this step" data-hudhud-step="'+esc(item.id)+'" data-step-index="'+index+'">🦉</button>':'')+
     '</div>').join("")+'</div>':
     '<div class="no-steps">No steps defined for this '+(kind==="project"?"project":"opportunity")+'.</div>';
   return '<article class="workspace-card '+(item.status==="Done"?"is-done":"")+'">'+
     '<div class="workspace-card-head"><div><div class="muted">'+(kind==="project"?"PROJECT":"OPPORTUNITY")+'</div><h3>'+esc(item.name)+'</h3></div><span class="pill '+(item.status==="Done"?"pill-done":"")+'">'+esc(item.status||"Planning")+'</span></div>'+
     '<p class="workspace-description">'+esc(item.description||item.notes||"No description provided.")+'</p>'+
     connectionHtml+
     '<div class="workspace-progress"><div><span>PROGRESS</span><strong>'+p.done+'/'+p.total+' steps</strong></div><div class="progress-track"><i style="width:'+percent+'%"></i></div></div>'+
     stepsHtml+
     '<div class="workspace-card-actions"><button type="button" class="secondary" data-plan-item="'+kind+'" data-item-id="'+esc(item.id)+'">✎ Manage steps</button></div>'+
   '</article>';
 }).join("")+'</div>';
}
let projectFilter="active";
let opportunityFilter="active";
function workspacePlanForm(kind,item){
 const steps=ensureSteps(item);
 const count=steps.length||3;
 return '<div class="section-head"><div><span class="eyebrow">EDIT WORKFLOW</span><h2>Manage '+(kind==="project"?"project":"opportunity")+'</h2><span class="muted">Update the description, choose the number of steps, and give HudHud a prompt for each step.</span></div></div>'+
 '<form class="card form workspace-form" id="planForm" data-plan-kind="'+kind+'" data-plan-id="'+esc(item.id)+'">'+
 '<label>Name *</label><input name="name" required maxlength="100" value="'+esc(item.name)+'">'+
 '<label>Description *</label><textarea name="description" required maxlength="1000">'+esc(item.description||item.notes||"")+'</textarea>'+
 '<label>Number of steps *</label><select id="planStepCount" name="stepCount">'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+((i+1)===count?"selected":"")+'>'+(i+1)+(i===0?" step":" steps")+'</option>').join("")+'</select>'+
 '<div class="step-builder"><div class="step-builder-head"><span>WORKFLOW STEPS</span><small>Name the step, then tell HudHud what completing it means.</small></div><div id="planStepFields" class="step-builder-fields"></div></div>'+
 '<div class="form-actions"><button type="submit" class="primary">Save workflow</button><button type="button" class="secondary" data-action="cancel">Cancel</button></div></form>';
}
function bindPlanBuilder(item){
 const select=document.getElementById("planStepCount"),fields=document.getElementById("planStepFields");
 if(!select||!fields)return;
 const renderFields=()=>{
   const count=Number(select.value)||1,steps=ensureSteps(item);
   fields.innerHTML=Array.from({length:count},(_,i)=>{
     const existing=steps[i];
     return '<div class="step-builder-item"><div class="step-name-field"><span>'+String(i+1).padStart(2,"0")+'</span><input name="step_'+i+'" maxlength="120" placeholder="Step '+(i+1)+' name" value="'+esc(existing?.name||"")+'" required></div><input class="step-prompt-field" name="step_prompt_'+i+'" maxlength="500" placeholder="HudHud prompt for this step (optional)" value="'+esc(existing?.prompt||existing?.name||"")+'"></div>';
   }).join("");
 };
 select.onchange=renderFields;
 renderFields();
}
function editWorkspacePlan(kind,id){
 const collection=kind==="project"?state.projects:state.opportunities;
 const item=collection.find(x=>x.id===id);
 if(!item){toast("Item not found");return;}
 document.getElementById("main").innerHTML=workspacePlanForm(kind,item);
 bind(kind==="project"?"projects":"opportunities");
 bindPlanBuilder(item);
}

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
let providerAccountsCache=null;
async function loadProviderAccounts(){
 const token=await authAccessToken();
 const r=await fetch("/api/provider-accounts",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
 const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
 if(!r.ok)throw new Error(data.error||"Could not load connected accounts.");
 providerAccountsCache=data.accounts||[];
 return providerAccountsCache;
}
function providerLabel(p){return p==="github"?"GitHub":p==="vercel"?"Vercel":"Supabase";}
function providerIcon(p){return p==="github"?"🐙":p==="vercel"?"▲":"⚡";}
async function openProviderAccounts(){
 if(!currentUser){showAuthModal("signin");return;}
 const host=document.getElementById("providerAccountsHost");if(!host)return;
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-provider-accounts></div><div class="resource-dialog"><div class="resource-loading"><span class="thinking-feather">🪶</span>Loading connected accounts…</div></div></div>';
 try{
   const accounts=await loadProviderAccounts();
   const grouped={github:[],vercel:[],supabase:[]};accounts.forEach(a=>(grouped[a.provider]||[]).push(a));
   host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-provider-accounts></div><div class="resource-dialog">'+
    '<button class="resource-close" data-close-provider-accounts>×</button><div class="eyebrow">ACCOUNTS / CONNECTIONS</div><h2>Connected accounts</h2><p class="resource-subtitle">Connect multiple GitHub, Vercel and Supabase accounts. Credentials stay server-side.</p>'+
    Object.keys(grouped).map(p=>'<div class="account-provider-block"><div class="account-provider-head"><span>'+providerIcon(p)+'</span><strong>'+providerLabel(p)+'</strong><button class="secondary account-add" data-add-provider="'+p+'">+ Add account</button></div>'+
      (grouped[p].length?grouped[p].map(a=>'<div class="account-row"><div><strong>'+esc(a.account_name)+'</strong><small>'+esc(a.account_email||a.provider_account_id)+'</small></div><span class="account-actions"><span class="pill">Connected</span><button class="danger account-remove" data-remove-account="'+esc(a.id)+'">Remove</button></span></div>').join(""):'<div class="account-empty">No '+providerLabel(p)+' accounts connected yet.</div>')+
    '</div>').join("")+
    '<div class="form-actions"><button class="secondary" data-close-provider-accounts>Close</button></div></div></div>';
   host.querySelectorAll("[data-close-provider-accounts]").forEach(b=>b.onclick=()=>{host.innerHTML="";});
   host.querySelectorAll("[data-add-provider]").forEach(b=>b.onclick=()=>connectProviderAccount(b.dataset.addProvider));
   host.querySelectorAll("[data-remove-account]").forEach(b=>b.onclick=()=>removeProviderAccount(b.dataset.removeAccount));
 }catch(e){host.querySelector(".resource-dialog").innerHTML='<button class="resource-close" data-close-provider-accounts>×</button><div class="eyebrow">ACCOUNT ERROR</div><h2>Could not load accounts</h2><p class="resource-subtitle">'+esc(e.message||String(e))+'</p>';}
}
function connectProviderAccount(provider){window.location.href="/api/connection-oauth?action=start&provider="+encodeURIComponent(provider);}
async function removeProviderAccount(id){
 if(!confirm("Remove this provider account from HudHud?"))return;
 const token=await authAccessToken();const r=await fetch("/api/provider-accounts?id="+encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer "+token}});
 if(!r.ok){const d=await r.json().catch(()=>({}));toast(d.error||"Could not remove account.");return;}
 toast("Provider account removed");openProviderAccounts();
}
function connections(){
 return '<div class="section-head"><div><span class="eyebrow">CONTROL / SETTINGS</span><h2>Connections</h2><span class="muted">Open a connection to configure its focus, resources and project scope.</span></div><div class="connection-head-actions"><button class="secondary" data-connection-reconnect-all>↻ Attempt reconnect</button><button class="primary" data-connection-refresh>↻ Check all connections</button></div></div>'+
 '<div class="connection-summary card"><div><div class="muted">ACTIVE CONNECTIONS</div><strong id="activeConnectionCount">—</strong><span> live tool connections</span></div><div id="activeConnectionNames" class="active-connection-names">Checking…</div></div>'+
 '<div class="connection-control-grid">'+
 '<button type="button" class="card connection-control-card connection-clickable" data-open-connection="github"><span class="status-light status-unknown" data-conn-light="github"></span><div class="connection-logo">🐙</div><h3>GitHub</h3><p>Repositories, files, issues and commits.</p><div class="connection-status-line"><strong data-conn-status="github">Checking…</strong><span data-conn-detail="github">—</span></div><span class="connection-open-hint">Open connection →</span></button>'+
 '<button type="button" class="card connection-control-card connection-clickable" data-open-connection="vercel"><span class="status-light status-unknown" data-conn-light="vercel"></span><div class="connection-logo">▲</div><h3>Vercel</h3><p>Projects, deployments and runtime operations.</p><div class="connection-status-line"><strong data-conn-status="vercel">Checking…</strong><span data-conn-detail="vercel">—</span></div><span class="connection-open-hint">Open connection →</span></button>'+
 '<button type="button" class="card connection-control-card connection-clickable" data-open-connection="supabase"><span class="status-light status-unknown" data-conn-light="supabase"></span><div class="connection-logo">⚡</div><h3>Supabase</h3><p>Tables, data and backend services.</p><div class="connection-status-line"><strong data-conn-status="supabase">Checking…</strong><span data-conn-detail="supabase">—</span></div><span class="connection-open-hint">Open connection →</span></button>'+
 '<div class="card connection-settings"><div><div class="muted">ACCOUNTS</div><h3>Multiple provider accounts</h3><p>Sign in to additional GitHub, Vercel or Supabase accounts. HudHud keeps provider credentials server-side.</p></div><button class="primary" data-open-provider-accounts>👤 Manage connected accounts</button></div>'+
 '<div class="card"><div class="muted">RECORDED CONNECTIONS</div><h3>Workspace notes</h3>'+list(state.connections,"No connection profiles yet.","Open GitHub, Vercel or Supabase above to configure one.")+'</div>'+
 '</div><div id="connectionModalHost"></div><div id="providerAccountsHost"></div>';
}

function premium(){
 const plans=[
  {key:"free",name:"Free",price:"$0.00",period:"forever",tag:"Start here",desc:"The core HudHud workspace for getting organized.",features:["Command Center","Projects & opportunities","Core connections","HudHud Core"],button:"Current plan"},
  {key:"pro",name:"Pro",price:"$5.99",period:"/ month",tag:"For builders",desc:"More power for active projects, automations and connected work.",features:["Everything in Free","Expanded project workflows","Priority HudHud actions","Advanced connections"],button:"Upgrade to Pro"},
  {key:"premium",name:"Premium",price:"$9.99",period:"/ month",tag:"Full power",desc:"The complete HudHud operating layer for serious execution.",features:["Everything in Pro","Premium HudHud capabilities","Higher workflow limits","Priority access"],button:"Go Premium"},
  {key:"test",name:"Test Checkout",price:"$0.50",period:"one-time test",tag:"TEMPORARY",desc:"Temporary checkout verification. Stripe USD charges cannot be $0.01, so this uses the $0.50 minimum.",features:["Live Checkout verification","Safe temporary test option","Remove when testing is complete"],button:"Run $0.50 test"}
 ];
 return '<div class="premium-page"><div class="premium-hero"><span class="eyebrow">HUDHUD PREMIUM</span><h2>Choose your HudHud plan.</h2><p class="muted">Upgrade the operating system as your work grows. Free stays free; Pro and Premium unlock additional capabilities.</p></div><div class="premium-grid">'+plans.map(p=>'<div class="card premium-plan '+(p.key==="premium"?"premium-featured":"")+' '+(p.key==="test"?"premium-test":"")+'"><div class="premium-plan-head"><div><span class="premium-tag">'+esc(p.tag)+'</span><h3>'+esc(p.name)+'</h3></div><div class="premium-price"><strong>'+esc(p.price)+'</strong><span>'+esc(p.period)+'</span></div></div><p>'+esc(p.desc)+'</p><ul>'+p.features.map(f=>'<li>✓ '+esc(f)+'</li>').join("")+'</ul><button class="'+(p.key==="free"?"secondary":"primary")+' premium-button" data-premium-plan="'+p.key+'" '+(p.key==="free"?"disabled":"")+'>'+esc(p.button)+'</button></div>').join("")+'</div><div class="card premium-note"><div><div class="muted">BILLING</div><h3>Stripe-powered subscriptions</h3><p>Checkout is hosted by Stripe. HudHud never stores your card details. You can manage an active subscription from your billing account.</p></div><span class="stripe-badge">STRIPE</span></div><div id="premiumStatus" class="premium-status"></div></div>';
}
function documents(){return '<div class="section-head"><div><h2>Documents</h2><span class="muted">Fresh workspace — no documents loaded.</span></div></div><div class="empty"><strong>No documents.</strong>The file layer comes later.</div>';}
function activity(){return '<div class="section-head"><div><h2>Activity</h2><span class="muted">Real actions from this browser.</span></div><button class="danger" data-action="clear-activity">Clear activity</button></div>'+list(state.activity,"No activity yet.","Your real actions will appear here.");}
function core(){
 const meta=currentUser?.user_metadata||{};
 const fullName=meta.full_name||meta.fullName||meta.name||[meta.first_name,meta.last_name].filter(Boolean).join(" ")||"Not provided";
 const email=currentUser?.email||"Not signed in";
 const ua=navigator.userAgent||"Unknown";
 const platform=navigator.userAgentData?.platform||navigator.platform||"Unknown";
 const browser=navigator.userAgentData?.brands?.map(x=>x.brand+" "+x.version).join(", ")||"Detected from browser";
 const device=platform+" • "+(navigator.userAgentData?.mobile?"Mobile":"Desktop");
 const screenSize=(window.screen?.width&&window.screen?.height)?window.screen.width+" × "+window.screen.height:"Unknown";
 const language=navigator.language||"Unknown";
 const online=navigator.onLine?"Online":"Offline";
 return '<div class="section-head"><div><span class="eyebrow">HUDHUD CORE</span><h2>HudHud Core</h2><span class="muted">Your account identity and the device currently connected to HudHud.</span></div></div><div class="grid">'+
 '<div class="card"><div class="muted">USER INFORMATION</div><h3>👤 '+esc(fullName)+'</h3><p><strong>Email:</strong> '+esc(email)+'</p><p class="muted">This identity comes from your signed-in HudHud account.</p></div>'+
 '<div class="card"><div class="muted">DEVICE</div><h3>💻 '+esc(device)+'</h3><p><strong>Platform:</strong> '+esc(platform)+'</p><p><strong>Screen:</strong> '+esc(screenSize)+'</p><p><strong>Connection:</strong> '+esc(online)+'</p></div>'+
 '<div class="card"><div class="muted">BROWSER</div><h3>🌐 '+esc(browser)+'</h3><p><strong>Language:</strong> '+esc(language)+'</p><p class="device-ua"><strong>User agent:</strong> '+esc(ua)+'</p></div>'+
 '<div class="card"><div class="muted">WORKSPACE</div><h3>'+(currentUser?"Authenticated":"Not signed in")+'</h3><p>'+(currentUser?"Your private HudHud workspace is tied to this account.":"Sign in to associate your workspace with your account.")+'</p></div></div><div class="card appearance-card"><div><div class="muted">APPEARANCE</div><h3>Day / Night</h3><p>Switch the visual theme instantly.</p></div><button id="themeToggle" class="theme-toggle" type="button"><span id="themeIcon">☾</span><span id="themeLabel">Night</span><i></i></button></div>';
}

function stepOptions(){
 return Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+(i===0?" step":" steps")+'</option>').join("");
}
function stepBuilderFields(prefix,count){
 let html="";
 for(let i=0;i<count;i++)html+='<div class="step-builder-item"><div class="step-name-field"><span>'+String(i+1).padStart(2,"0")+'</span><input name="step_'+i+'" maxlength="120" placeholder="Step '+(i+1)+' name" required></div><input class="step-prompt-field" name="step_prompt_'+i+'" maxlength="500" placeholder="HudHud prompt for this step (optional)"></div>';
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
 if(["projects","opportunities","connections","documents","activity","premium"].includes(view)&&!requireAuth(view))return;
 document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const m=document.getElementById("main");
 if(!m)return;
 const pages={home:home,projects:projects,opportunities:opportunities,connections:connections,tools:tools,studio:studio,documents:documents,activity:activity,core:core,system:system};
 m.innerHTML=(pages[view]||home)();
 bind(view);
 if(view==="home") { bindChat(); bindHomeAuth(); }
 if(view==="core") bindThemeToggle();
 if(view==="studio") bindStudio();
 if(view==="system") bindSystem();
 if(view==="connections") bindConnections();
 if(view==="premium") bindPremium();
}

async function bindPremium(){
 document.querySelectorAll("[data-premium-plan]").forEach(b=>b.onclick=async()=>{
   const plan=b.dataset.premiumPlan;
   if(plan==="free")return;
   if(!currentUser){showAuthModal("signin");return;}
   const status=document.getElementById("premiumStatus");
   b.disabled=true;b.textContent="Opening Stripe…";
   if(status)status.textContent="";
   try{
     const token=await authAccessToken();
     const r=await fetch("/api/stripe-checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan})});
     const d=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(d.error||"Could not start Stripe Checkout.");
     if(d.url)window.location.href=d.url; else throw new Error("Stripe did not return a Checkout URL.");
   }catch(e){
     if(status)status.textContent=e.message||"Checkout failed.";
     b.disabled=false;
     b.textContent=plan==="test"?"Run $0.50 test":plan==="pro"?"Upgrade to Pro":"Go Premium";
   }
 });
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
 document.querySelectorAll("[data-plan-item]").forEach(b=>b.onclick=()=>editWorkspacePlan(b.dataset.planItem,b.dataset.itemId));

 const pf=document.getElementById("projectForm");
 if(pf)pf.onsubmit=async e=>{
   e.preventDefault();
   const f=new FormData(pf),name=String(f.get("name")).trim(),description=String(f.get("description")).trim();
   if(!name||!description)return;
   const count=Number(f.get("stepCount"))||1;
   const steps=Array.from({length:count},(_,i)=>({id:"step_"+Date.now()+"_"+i,name:String(f.get("step_"+i)||"").trim(),prompt:String(f.get("step_prompt_"+i)||f.get("step_"+i)||"").trim(),done:false}));
   if(steps.some(s=>!s.name)){toast("Name every project step");return;}
   const item={id:"project_"+Date.now(),name,description,status:String(f.get("status")),steps,createdAt:new Date().toISOString()};
   state.projects.unshift(item);
   save();
   if(!(await cloudInsertProject(item))){state.projects.shift();save();return;}
   log("Created project: "+name+" with "+steps.length+" steps");
   toast("Project created");
   render("projects");
 };
 const of=document.getElementById("oppForm");
 if(of)of.onsubmit=async e=>{
   e.preventDefault();
   const f=new FormData(of),name=String(f.get("name")).trim(),description=String(f.get("description")).trim();
   if(!name||!description)return;
   const count=Number(f.get("stepCount"))||1;
   const steps=Array.from({length:count},(_,i)=>({id:"step_"+Date.now()+"_"+i,name:String(f.get("step_"+i)||"").trim(),done:false}));
   if(steps.some(s=>!s.name)){toast("Name every opportunity step");return;}
   const item={id:"opportunity_"+Date.now(),name,description,status:String(f.get("status")),steps,createdAt:new Date().toISOString()};
   state.opportunities.unshift(item);
   save();
   if(!(await cloudInsertOpportunity(item))){state.opportunities.shift();save();return;}
   log("Added opportunity: "+name+" with "+steps.length+" steps");
   toast("Opportunity saved");
   render("opportunities");
 };
 const planForm=document.getElementById("planForm");
 if(planForm)planForm.onsubmit=async e=>{
   e.preventDefault();
   const kind=planForm.dataset.planKind,id=planForm.dataset.planId,collection=kind==="project"?state.projects:state.opportunities,item=collection.find(x=>x.id===id);
   if(!item)return;
   const f=new FormData(planForm),name=String(f.get("name")).trim(),description=String(f.get("description")).trim(),count=Number(f.get("stepCount"))||1;
   const oldSteps=ensureSteps(item);
   const steps=Array.from({length:count},(_,i)=>({id:oldSteps[i]?.id||("step_"+Date.now()+"_"+i),name:String(f.get("step_"+i)||"").trim(),prompt:String(f.get("step_prompt_"+i)||oldSteps[i]?.prompt||f.get("step_"+i)||"").trim(),done:!!oldSteps[i]?.done}));
   if(!name||!description||steps.some(s=>!s.name)){toast("Complete the workflow fields");return;}
   item.name=name;item.description=description;item.steps=steps;item.updatedAt=new Date().toISOString();
   const allDone=steps.length>0&&steps.every(s=>s.done);
   if(allDone){item.preDoneStatus=item.preDoneStatus||item.status||"Active";item.status="Done";}else if(item.status==="Done"){item.status=item.preDoneStatus||"Active";}
   log("Updated "+kind+" workflow: "+name);
   save();
   const ok=kind==="project"?await cloudUpdateProject(item):await cloudUpdateOpportunity(item);
   if(!ok){await loadCloudState();render(kind==="project"?"projects":"opportunities");return;}
   toast("Workflow updated");render(kind==="project"?"projects":"opportunities");
 };
 const cf=document.getElementById("connForm");
 if(cf)cf.onsubmit=async e=>{e.preventDefault();const f=new FormData(cf),name=String(f.get("name")).trim();if(!name)return;const item={id:"connection_"+Date.now(),name:name,details:String(f.get("details")).trim(),status:"Recorded",createdAt:new Date().toISOString()};state.connections.unshift(item);save();if(!(await cloudInsertConnection(item))){state.connections.shift();save();return;}log("Recorded connection: "+name);toast("Connection recorded");render("connections");};
}
async function toggleWorkspaceStep(kind,itemId,index){
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
 const ok=kind==="project"?await cloudUpdateProject(item):await cloudUpdateOpportunity(item);
 if(!ok){await loadCloudState();}
 render(kind==="project"?"projects":"opportunities");
}

function addMessage(who,text,kind){
 const box=document.getElementById("messages");if(!box)return;
 const d=document.createElement("div");d.className="message "+kind;
 const b=document.createElement("b");b.textContent=who;
 const s=document.createElement("span");s.textContent=text;
 d.appendChild(b);d.appendChild(s);box.appendChild(d);box.scrollTop=box.scrollHeight;
}
async function handleWorkspaceCommand(message){
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

function requiresWorkspaceAuth(message){
 return /\b(?:create|add|update|change|set)\b[\s\S]*\b(?:project|opportunity|connection)\b/i.test(String(message||""));
}
async function sendToHudHud(message){
 const status=document.getElementById("brainStatus");
 const endpoint="/api/hudhud";
 try{
   status.innerHTML='<span class="thinking-feather" aria-hidden="true">🪶</span><span>HudHud is thinking…</span>';
   if(!currentUser&&requiresWorkspaceAuth(message)){
     pendingWorkspaceMessage=message;
     showAuthModal("signin");
     status.textContent="HUDHUD • sign in required for workspace actions";
     return;
   }
   const workspaceAction=await handleWorkspaceCommand(message);
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
async function authAccessToken(){
 if(!supabaseClient)return "";
 const {data}=await supabaseClient.auth.getSession();
 return data.session?.access_token||"";
}
function connectionIcon(provider){return provider==="github"?"🐙":provider==="vercel"?"▲":"⚡";}
async function openConnectionModal(provider){
 if(!currentUser){showAuthModal("signin");return;}
 const host=document.getElementById("connectionModalHost");if(!host)return;
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-resource-modal></div><div class="resource-dialog"><div class="resource-loading"><span class="thinking-feather">🪶</span>Loading '+esc(provider)+' resources…</div></div></div>';
 const token=await authAccessToken();
 try{
   const existing=state.connections.find(x=>x.provider===provider)||null;
   const settings=existing?.settings||{};
   const ar=await fetch("/api/provider-accounts",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const ad=await ar.json().catch(()=>({accounts:[]}));
   if(!ar.ok)throw new Error(ad.error||"Could not load connected accounts.");
   const accounts=(ad.accounts||[]).filter(x=>x.provider===provider);
   const accountId=String(settings.account_id||"");
   const query="/api/connection-resources?provider="+encodeURIComponent(provider)+(accountId?"&account_id="+encodeURIComponent(accountId):"");
   const r=await fetch(query,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const raw=await r.text();const data=JSON.parse(raw);if(!r.ok)throw new Error(data.error||"Resource discovery failed");
   connectionResourceCache[provider]=data;
   const selected=new Set(Array.isArray(settings.resources)?settings.resources:[]);
   const selectedProjects=new Set(projectConnectionRowsForProvider(provider).map(x=>x.project_id));
   host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-resource-modal></div><div class="resource-dialog">'+
     '<button class="resource-close" data-close-resource-modal>×</button>'+
     '<div class="eyebrow">CONNECTION SETTINGS</div><h2>'+connectionIcon(provider)+' '+esc(provider.charAt(0).toUpperCase()+provider.slice(1))+'</h2>'+
     '<p class="resource-subtitle">Choose the resources HudHud should focus on. These settings belong to your account; secrets remain server-side.</p>'+
     '<div class="resource-setting"><label><span>ACCOUNT</span><select id="connectionProviderAccount"><option value="">Use current server connection</option>'+accounts.map(a=>'<option value="'+esc(a.id)+'" '+(String(a.id)===accountId?"selected":"")+'>'+esc(a.account_name)+(a.account_email?" • "+esc(a.account_email):"")+'</option>').join("")+'</select></label></div>'+
     (provider==="supabase"&&data.project?'<div class="resource-project"><strong>Supabase project</strong><small>'+esc(data.project.ref||"Configured project")+' • '+esc(data.project.url||"")+'</small></div>':'')+
     '<div class="resource-setting"><label><input id="connectionFocusSelected" type="checkbox" '+(settings.focus==="selected"?"checked":"")+'><span>Focus only on selected resources</span></label></div>'+
     '<div class="resource-section"><div class="resource-section-head"><strong>AVAILABLE RESOURCES</strong><span>'+data.resources.length+' found</span></div><div class="resource-list">'+
       (data.resources.length?data.resources.map(x=>'<label class="resource-item"><input type="checkbox" data-resource-id="'+esc(x.id)+'" '+(selected.has(String(x.id))?"checked":"")+'><span><strong>'+esc(x.name||x.full_name||x.id)+'</strong><small>'+esc(x.full_name||x.framework||x.type||"")+'</small></span></label>').join(""):'<div class="empty"><strong>No resources returned.</strong>Check the connection credentials and permissions.</div>')+
     '</div></div>'+
     '<div class="resource-section"><div class="resource-section-head"><strong>INCLUDE IN PROJECTS</strong><span>Optional</span></div><div class="resource-project-list">'+
       ((state.projects||[]).length?state.projects.map(p=>'<label class="resource-item"><input type="checkbox" data-resource-project="'+esc(p.id)+'" '+(selectedProjects.has(String(p.id))?"checked":"")+'><span><strong>'+esc(p.name)+'</strong><small>'+esc(p.status||"Planning")+'</small></span></label>').join(""):'<div class="muted">Create a project first.</div>')+
     '</div></div>'+
     '<div class="form-actions"><button type="button" class="secondary" data-close-resource-modal>Cancel</button><button type="button" class="primary" data-save-connection="'+provider+'">Save connection</button></div>'+
   '</div></div>';
   host.querySelectorAll("[data-close-resource-modal]").forEach(b=>b.onclick=closeResourceModal);
   host.querySelector("[data-save-connection]").onclick=()=>saveConnectionModal(provider);
 }catch(e){
   host.querySelector(".resource-dialog").innerHTML='<button class="resource-close" data-close-resource-modal>×</button><div class="eyebrow">CONNECTION ERROR</div><h2>Could not load '+esc(provider)+'</h2><p class="resource-subtitle">'+esc(e.message||String(e))+'</p><div class="form-actions"><button class="secondary" data-close-resource-modal>Close</button></div>';
   host.querySelector("[data-close-resource-modal]").onclick=closeResourceModal;
 }
}
function projectConnectionRowsForProvider(provider){
 const ids=new Set(state.connections.filter(c=>c.provider===provider).map(c=>c.id));
 return Object.values(projectConnections).flat().filter(x=>ids.has(x.connection_id));
}
function closeResourceModal(){const host=document.getElementById("connectionModalHost");if(host)host.innerHTML="";}
async function saveConnectionModal(provider){
 const host=document.getElementById("connectionModalHost");if(!host)return;
 const resources=Array.from(host.querySelectorAll("[data-resource-id]:checked")).map(x=>x.dataset.resourceId);
 const focus=host.querySelector("#connectionFocusSelected")?.checked?"selected":"all";
 const account_id=host.querySelector("#connectionProviderAccount")?.value||null;
 const projects=Array.from(host.querySelectorAll("[data-resource-project]:checked")).map(x=>x.dataset.resourceProject);
 const item=await cloudUpsertConnection(provider,{resources,focus,account_id},(connectionResourceCache[provider]?.resources||[]).length+" resource(s) available");
 if(!item)return;
 const rows=Object.entries(projectConnections).flatMap(([projectId,items])=>items.filter(x=>x.connection_id!==item.id).map(x=>({...x,project_id:projectId})));
 projects.forEach(projectId=>rows.push({project_id:projectId,connection_id:item.id,settings:{resources}}));
 const projectIds=new Set((state.projects||[]).map(p=>p.id));
 for(const projectId of projectIds){
   const wanted=rows.filter(x=>x.project_id===projectId);
   await cloudSaveProjectConnections(projectId,wanted);
 }
 closeResourceModal();render("connections");toast(provider.charAt(0).toUpperCase()+provider.slice(1)+" settings saved");
}
async function openProjectConnectionsModal(projectId){
 const project=state.projects.find(p=>p.id===projectId);if(!project)return;
 const host=document.getElementById("connectionModalHost")||document.body.appendChild(Object.assign(document.createElement("div"),{id:"connectionModalHost"}));
 const available=state.connections.filter(c=>c.provider);
 const current=new Set(projectConnectionRows(projectId).map(x=>x.connection_id));
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-resource-modal></div><div class="resource-dialog"><button class="resource-close" data-close-resource-modal>×</button><div class="eyebrow">PROJECT CONNECTIONS</div><h2>🔗 '+esc(project.name)+'</h2><p class="resource-subtitle">Select the connections HudHud is allowed to use while executing this project.</p><div class="resource-project-list">'+
   (available.length?available.map(c=>'<label class="resource-item project-connection-option"><input type="checkbox" data-project-connection="'+esc(c.id)+'" '+(current.has(c.id)?"checked":"")+'><span><strong>'+connectionIcon(c.provider)+' '+esc(c.name)+'</strong><small>'+esc((c.settings?.focus==="selected"?"Focused resources":"All configured resources"))+'</small></span><button type="button" class="mini-link" data-open-connection="'+esc(c.provider)+'">Settings</button></label>').join(""):'<div class="empty"><strong>No configured connections.</strong><p>Open GitHub or Vercel in Connections first.</p></div>')+
   '</div><div class="form-actions"><button type="button" class="secondary" data-close-resource-modal>Cancel</button><button type="button" class="primary" data-save-project-connections="'+esc(projectId)+'">Save project connections</button></div></div></div>';
 host.querySelectorAll("[data-close-resource-modal]").forEach(b=>b.onclick=closeResourceModal);
 host.querySelector("[data-save-project-connections]")?.addEventListener("click",async()=>{const ids=Array.from(host.querySelectorAll("[data-project-connection]:checked")).map(x=>x.dataset.projectConnection);const rows=ids.map(id=>({project_id:projectId,connection_id:id,settings:state.connections.find(c=>c.id===id)?.settings||{}}));if(await cloudSaveProjectConnections(projectId,rows)){closeResourceModal();render("projects");toast("Project connections saved");}});
 host.querySelectorAll(".mini-link[data-open-connection]").forEach(b=>b.onclick=()=>openConnectionModal(b.dataset.openConnection));
}
async function runHudHudStep(projectId,index,button){
 const project=state.projects.find(p=>p.id===projectId),step=project?.steps?.[index];
 if(!project||!step)return;
 if(button){button.disabled=true;button.textContent="🪶";}
 try{
   const token=await authAccessToken();
   if(!token)throw new Error("Please sign in again.");
   const r=await fetch("/api/hudhud-step",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({project,step,connections:selectedProjectConnections(projectId)})});
   const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
   if(!r.ok||!data.completed)throw new Error(data.error||"HudHud could not complete this step.");
   step.done=true;
   const allDone=project.steps.length>0&&project.steps.every(s=>s.done);
   if(allDone){project.preDoneStatus=project.preDoneStatus||project.status||"Active";project.status="Done";}
   project.updatedAt=new Date().toISOString();save();
   await cloudUpdateProject(project);
   log("HudHud completed project step: "+project.name+" • "+step.name);
   toast("HudHud completed: "+step.name);
   addMessage("HudHud",data.reply||"Step completed.","hud");
   render("projects");
 }catch(e){toast("HudHud step failed: "+(e.message||String(e)));if(button){button.disabled=false;button.textContent="🦉";}}
}
function bindConnections(){
 document.querySelectorAll("[data-open-provider-accounts]").forEach(b=>b.onclick=openProviderAccounts);
 document.querySelectorAll("[data-open-connection]").forEach(b=>b.onclick=e=>{e.preventDefault();openConnectionModal(b.dataset.openConnection);});
 document.querySelectorAll("[data-project-connections]").forEach(b=>b.onclick=()=>openProjectConnectionsModal(b.dataset.projectConnections));
 document.querySelectorAll("[data-hudhud-step]").forEach(b=>b.onclick=()=>runHudHudStep(b.dataset.hudhudStep,Number(b.dataset.stepIndex),b));
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

function bindHomeAuth(){
 document.querySelectorAll("[data-auth-start]").forEach(b=>b.onclick=async()=>{
   if(currentUser){render("projects");return;}
   await initSupabase().catch(()=>{});
   if(currentUser){render("projects");return;}
   showAuthModal("signin");
 });
}

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
async function init(){
 const today=document.getElementById("today");if(today)today.textContent=nowLabel();
 document.querySelectorAll("#nav button").forEach(b=>b.addEventListener("click",()=>render(b.dataset.view)));
 render("home");
 initSupabase().catch(err=>console.warn("Supabase auth not initialized yet:",err.message));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();