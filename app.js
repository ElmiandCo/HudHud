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
async function cloudDeleteProject(item){
 if(!hasCloudUser())return true;
 const {error:pcError}=await supabaseClient.from("hudhud_project_connections").delete().eq("project_id",item.id).eq("user_id",currentUser.id);
 if(pcError){console.error(pcError);toast("Project connection delete failed");return false;}
 const {error}=await supabaseClient.from("hudhud_projects").delete().eq("id",item.id).eq("user_id",currentUser.id);
 if(error){console.error(error);toast("Project delete failed");return false;}
 return true;
}
async function cloudDeleteOpportunity(item){
 if(!hasCloudUser())return true;
 const {error}=await supabaseClient.from("hudhud_opportunities").delete().eq("id",item.id).eq("user_id",currentUser.id);
 if(error){console.error(error);toast("Opportunity delete failed");return false;}
 return true;
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
   const memberHtml='<div class="project-members"><div class="project-members-head"><span>MEMBERS</span><button type="button" class="secondary mini-button" data-members-kind="'+kind+'" data-members-id="'+esc(item.id)+'">＋ Manage</button></div><div class="project-member-chips" data-member-chips="'+kind+'" data-member-item="'+esc(item.id)+'"><span class="muted">Loading contacts…</span></div></div>';
   const stepsHtml=p.total?'<div class="workspace-steps">'+item.steps.map((step,index)=>
     '<div class="workspace-step-row"><button type="button" class="workspace-step '+(step.done?"done":"")+'" data-step-toggle="'+kind+'" data-item-id="'+esc(item.id)+'" data-step-index="'+index+'"><span class="step-check">'+(step.done?"✓":"")+'</span><span>'+esc(step.name)+'</span></button>'+
     (kind==="project"?'<button type="button" class="hudhud-step-button" title="Ask HudHud to complete this step" data-hudhud-step="'+esc(item.id)+'" data-step-index="'+index+'">🦉</button>':'')+
     '</div>').join("")+'</div>':
     '<div class="no-steps">No steps defined for this '+(kind==="project"?"project":"opportunity")+'.</div>';
   return '<article class="workspace-card '+(item.status==="Done"?"is-done":"")+'">'+
     '<div class="workspace-card-head"><div><div class="muted">'+(kind==="project"?"PROJECT":"OPPORTUNITY")+'</div><h3>'+esc(item.name)+'</h3></div><span class="pill '+(item.status==="Done"?"pill-done":"")+'">'+esc(item.status||"Planning")+'</span></div>'+
     '<p class="workspace-description">'+esc(item.description||item.notes||"No description provided.")+'</p>'+
     memberHtml+connectionHtml+
     '<div class="workspace-progress"><div><span>PROGRESS</span><strong>'+p.done+'/'+p.total+' steps</strong></div><div class="progress-track"><i style="width:'+percent+'%"></i></div></div>'+
     stepsHtml+
     '<div class="workspace-card-actions"><button type="button" class="secondary" data-plan-item="'+kind+'" data-item-id="'+esc(item.id)+'">✎ Manage steps</button><button type="button" class="secondary danger-button" data-delete-workspace="'+kind+'" data-item-id="'+esc(item.id)+'">Delete</button></div>'+
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
 return '<div class="section-head"><div><span class="eyebrow">CONTROL / SETTINGS</span><h2>Connections</h2><span class="muted">Open a connection to configure its focus, resources and project scope.</span></div><div class="connection-head-actions"><button class="secondary" data-connection-reset>↻ Reset settings</button><button class="secondary" data-connection-reconnect-all>👤 Manage accounts</button><button class="primary" data-connection-refresh>↻ Check all connections</button></div></div>'+
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
 const lifetime=localStorage.getItem("hudhud_pricing_mode")==="lifetime";
 const plans=[
  {key:"free",name:"Free",monthlyPrice:"$0",lifetimePrice:"$0",monthlyPeriod:"forever",lifetimePeriod:"forever",eyebrow:"STARTER",desc:"Everything you need to explore HudHud and organize your work.",features:["HudHud Command Center","Projects & opportunities","Core connections","HudHud Core"],button:"Current plan"},
  {key:"pro",name:"Pro",monthlyPrice:"$9.99",lifetimePrice:"$119.88",monthlyPeriod:"/ month",lifetimePeriod:"one-time",eyebrow:"MOST POPULAR",desc:"More power for active builders who want HudHud working alongside them.",features:["Everything in Free","Expanded project workflows","Priority HudHud actions","Advanced connections","More automation capacity"],button:"Choose Pro"},
  {key:"premium",name:"Premium",monthlyPrice:"$9.99",lifetimePrice:"$119.88",monthlyPeriod:"/ month",lifetimePeriod:"one-time",eyebrow:"FULL POWER",desc:"The complete HudHud operating layer for serious execution and connected work.",features:["Everything in Pro","Premium HudHud capabilities","Higher workflow limits","Priority access","Advanced automation"],button:"Choose Premium"}
 ];
 return '<div class="premium-page">'+
   '<div class="premium-hero"><div class="premium-orb">🦉</div><span class="eyebrow">HUDHUD MEMBERSHIP</span><h2>Build more with HudHud.</h2><p>Choose the workspace that fits how you work. Upgrade whenever you are ready.</p><div class="premium-toggle"><button type="button" class="'+(lifetime?"":"active")+'" data-pricing-mode="monthly">Monthly</button><button type="button" class="'+(lifetime?"active":"")+'" data-pricing-mode="lifetime">Lifetime membership</button></div></div>'+
   '<div class="premium-grid">'+plans.map(p=>'<article class="premium-plan '+(p.key==="pro"?"premium-popular ":"")+(p.key==="premium"?"premium-featured ":"")+'"><div class="premium-plan-glow"></div><div class="premium-plan-head"><span class="premium-tag">'+esc(p.eyebrow)+'</span>'+(p.key==="pro"?'<span class="premium-badge">POPULAR</span>':"")+'</div><h3>'+esc(p.name)+'</h3><p class="premium-desc">'+esc(p.desc)+'</p><div class="premium-price"><strong>'+esc(lifetime?p.lifetimePrice:p.monthlyPrice)+'</strong><span>'+esc(lifetime?p.lifetimePeriod:p.monthlyPeriod)+'</span></div>'+ (lifetime&&p.key!=="free"?'<div class="premium-annual-note">12 × $9.99 = $119.88 • pay once</div>':"") +'<div class="premium-divider"></div><ul>'+p.features.map(f=>'<li><span>✓</span>'+esc(f)+'</li>').join("")+'</ul><button class="'+(p.key==="free"?"secondary":"primary")+' premium-button" data-premium-plan="'+p.key+'" '+(p.key==="free"?"disabled":"")+'>'+esc(lifetime&&p.key!=="free"?"Get Lifetime Access":p.button)+'</button></article>').join("")+'</div>'+
   '<section class="premium-test-strip"><div><span class="premium-test-label">🧪 TEMPORARY TEST CHECKOUT</span><h3>Verify Stripe before launch</h3><p>Run a real Stripe Checkout test with a temporary <strong>$0.50</strong> one-time payment. Stripe\'s USD minimum is $0.50, so $0.01 cannot be charged as a USD Checkout payment.</p></div><button class="secondary premium-test-button" data-premium-plan="test">Test Checkout · $0.50</button></section>'+
   '<div class="premium-trust"><span>🔒 Secure Stripe Checkout</span><span>↻ Cancel anytime</span><span>⚡ Instant upgrade</span><span>🦉 HudHud-powered</span></div>'+
   '<div id="premiumStatus" class="premium-status"></div></div>';
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

function commandCenter(){
 const demo=[
  ["Jan 12","X-Subscriber-01","Pro","Active",9.99,1,0,3,2,12],
  ["Feb 03","X-Customer-01","Pro Lifetime","One-time",59.94,0,59.94,1,3,18],
  ["Mar 08","X-Subscriber-02","Pro","Active",9.99,1,0,1,4,24],
  ["Apr 02","X-Subscriber-06","Pro","Canceled",39.96,1,0,2,5,31],
  ["Apr 17","X-Customer-02","Premium Lifetime","One-time",59.94,0,59.94,2,5,38],
  ["May 21","X-Subscriber-03","Premium","Active",9.99,1,0,1,6,44],
  ["Jun 29","X-Customer-03","Pro Lifetime","One-time",59.94,0,59.94,2,7,51],
  ["Jul 14","X-Subscriber-04","Pro","Active",9.99,1,0,2,8,63],
  ["Aug 11","X-Customer-04","Premium Lifetime","One-time",59.94,0,59.94,3,9,72],
  ["Aug 18","X-Subscriber-06","Pro","Canceled",0, -1,0,1,7,58],
  ["Sep 05","X-Subscriber-05","Premium","Active",9.99,1,0,2,10,86],
  ["Sep 19","X-Customer-05","Pro Lifetime","One-time",59.94,0,59.94,3,12,92]
 ];
 const defs=[["github","🐙","GitHub","Repositories, files, issues and pull requests"],["vercel","▲","Vercel","Projects, deployments and production"],["supabase","⚡","Supabase","Database, authentication and resources"],["stripe","💳","Stripe","Subscriptions and one-time sales"],["hudhud","🦉","HudHud","Command layer and workspace"],["brain","🧠","HudHud Brain","Local AI bridge"],["openclaw","🦞","OpenClaw","Gateway and computer-side actions"]];
 const lines=["subscription","onetime","projects","steps","opportunities","ai"];
 return '<div class="command-center"><div class="command-hero"><div><span class="eyebrow">HUDHUD COMMAND CENTER</span><h2>Ecosystem Control & Analytics</h2><p>Power BI-style operational analytics across sales, subscriptions, projects, opportunities, AI usage and infrastructure.</p></div><div class="command-hero-actions"><button class="primary" data-command-diagnostic>🔎 Run Full Diagnostic</button><button class="secondary" data-command-add-tool>＋ Add Tool</button></div></div>'+
 '<section class="analytics-kpis"><div><span>💳 Active subscriptions</span><strong>4</strong><small>3 Pro • 1 Premium</small></div><div><span>🔴 Canceled subscriptions</span><strong>1</strong><small>X-Subscriber-06</small></div><div><span>🧾 One-time customers</span><strong>5</strong><small>Lifetime purchases</small></div><div><span>💰 Demo revenue</span><strong>$339.66</strong><small>Historical test data</small></div></section>'+
 '<section class="card analytics-panel"><div class="command-section-head"><div><span class="eyebrow">ANALYTICS</span><h3>Compare business activity</h3><p>Toggle series to compare the same timeline.</p></div><select id="analyticsRange"><option>All history</option><option>Last 180 days</option><option>Last 90 days</option></select></div><div class="analytics-filter-row">'+lines.map(k=>'<label><input type="checkbox" data-analytics-series="'+k+'" checked> '+({subscription:"Subscriptions",onetime:"One-time sales",projects:"Projects",steps:"Steps completed",opportunities:"Opportunities",ai:"AI usage"}[k])+'</label>').join("")+'</div><div id="analyticsChart" class="analytics-chart"></div></section>'+
 '<section class="command-grid"><div class="card"><div class="command-section-head"><div><span class="eyebrow">STRIPE</span><h3>Customers & subscription history</h3></div></div><div class="analytics-customers">'+demo.map(d=>'<div class="analytics-customer-row"><strong>'+d[1]+'</strong><span>'+d[2]+'</span><small>'+d[0]+' 2026</small><em class="'+(d[3]==="Canceled"?"canceled":"")+'">'+d[3]+'</em></div>').join("")+'</div></div><div class="card"><div class="command-section-head"><div><span class="eyebrow">INFRASTRUCTURE</span><h3>Service health</h3></div></div><div id="commandHealthList">'+defs.map(d=>'<div class="command-service" data-command-service="'+d[0]+'"><span class="command-service-icon">'+d[1]+'</span><div><strong>'+d[2]+'</strong><small>'+d[3]+'</small></div><span class="command-status status-unknown">CHECKING</span></div>').join("")+'</div></div></section>'+
 '<section class="command-grid"><div class="card"><div class="command-section-head"><div><span class="eyebrow">TAILSCALE</span><h3>Devices & network</h3></div></div><div class="analytics-infra-grid"><div><strong>Live</strong><span>Tailnet devices</span></div><div><strong>🟢</strong><span>HudHud Brain</span></div><div><strong>🟢</strong><span>OpenClaw Gateway</span></div><div><strong>🟢</strong><span>Tailscale</span></div></div><div id="commandDiagnosticLog" class="command-diagnostic-log"><div class="command-log-empty">Run diagnostic for live service status.</div></div></div><div class="card"><div class="command-section-head"><div><span class="eyebrow">RESOURCES</span><h3>Connected resources</h3></div></div><div id="commandResourceGrid" class="command-resource-grid"></div></div></section><div id="commandToolModal"></div></div>';
}
function renderAnalytics(){
 const host=document.getElementById("analyticsChart"); if(!host)return;
 const enabled=["subscription","onetime","projects","steps","opportunities","ai"].filter(k=>document.querySelector('[data-analytics-series="'+k+'"]')?.checked);
 const vals=enabled.map(k=>demoMetric(k)); const max=Math.max(1,...vals.flat());
 const colors=enabled.map((_,i)=>i);
 host.innerHTML='<svg viewBox="0 0 900 280" preserveAspectRatio="none">'+enabled.map((k,j)=>'<polyline class="analytics-line line-'+j+'" points="'+demoPoints(k,max)+'"></polyline>').join("")+'</svg><div class="analytics-xlabels">Jan&nbsp;&nbsp; Feb&nbsp;&nbsp; Mar&nbsp;&nbsp; Apr&nbsp;&nbsp; May&nbsp;&nbsp; Jun&nbsp;&nbsp; Jul&nbsp;&nbsp; Aug&nbsp;&nbsp; Sep</div>';
}
function demoMetric(k){
 const base={subscription:[1,1,2,2,3,3,4,4,4],onetime:[0,59.94,59.94,119.88,119.88,179.82,179.82,239.76,299.70],projects:[0,1,2,4,5,7,9,12,15],steps:[3,10,19,31,45,63,84,110,151],opportunities:[2,5,9,14,20,27,35,44,56],ai:[12,18,24,31,44,51,63,72,92]};return base[k]||[];}
function demoPoints(k,max){return demoMetric(k).map((v,i)=>(35+i*(830/8))+','+(245-(v/max)*210)).join(' ');}
function runCommandDiagnostic(){const stateEl=document.getElementById("commandDiagnosticState"),logEl=document.getElementById("commandDiagnosticLog"),listEl=document.getElementById("commandHealthList");if(logEl)logEl.innerHTML='<div class="command-log-item">🔎 Checking configured connections…</div>';fetch("/api/connection-status",{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||"Connection diagnostic failed.");const items=[];Object.entries(data.connections||{}).forEach(([name,d])=>{const ok=d.status==="connected";items.push((ok?"🟢":"🔴")+" "+name+" — "+(d.message||d.status||"unknown"));const row=listEl?.querySelector('[data-command-service="'+name+'"]');if(row){const st=row.querySelector(".command-status");st.textContent=ok?"CONNECTED":"ERROR";st.className="command-status "+(ok?"status-good":"status-bad")}});[["hudhud",true,"Runtime available"],["brain",true,"Control layer available"],["openclaw",false,"Local service not reported by browser"]].forEach(([name,ok,msg])=>{items.push((ok?"🟢":"🟡")+" "+name+" — "+msg);const row=listEl?.querySelector('[data-command-service="'+name+'"]');if(row){const st=row.querySelector(".command-status");st.textContent=ok?"ONLINE":"NOT REPORTED";st.className="command-status "+(ok?"status-good":"status-warn")}});if(stateEl){stateEl.textContent="DIAGNOSTIC COMPLETE";stateEl.className="system-state good"}if(logEl)logEl.innerHTML=items.map(x=>'<div class="command-log-item">'+esc(x)+'</div>').join("")}).catch(e=>{if(stateEl)stateEl.textContent="DIAGNOSTIC FAILED";if(logEl)logEl.innerHTML='<div class="command-log-item">🔴 '+esc(e.message||String(e))+'</div>'})}
function loadCommandResources(){const host=document.getElementById("commandResourceGrid");if(!host)return;authAccessToken().then(token=>{const providers=[["github","🐙","GitHub"],["vercel","▲","Vercel"],["supabase","⚡","Supabase"]];return Promise.all(providers.map(async([provider,icon,label])=>{try{const r=await fetch("/api/connection-resources?provider="+provider,{headers:token?{Authorization:"Bearer "+token}:{}}),d=await r.json(),resources=d.resources||[];return '<div class="command-resource-card"><span>'+icon+'</span><strong>'+label+'</strong><small>'+resources.length+' resource(s) discovered</small><div class="command-resource-list">'+resources.slice(0,6).map(x=>'<span>'+esc(x.name||x.full_name||x.id)+'</span>').join("")+'</div></div>'}catch(e){return '<div class="command-resource-card"><span>'+icon+'</span><strong>'+label+'</strong><small>Unable to inspect resources</small></div>'}})).then(rows=>host.innerHTML=rows.join(""))})}
function openCommandToolModal(){const host=document.getElementById("commandToolModal");if(!host)return;host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-command-tool></div><div class="resource-dialog"><button class="resource-close" data-close-command-tool>×</button><div class="eyebrow">ADD TOOL</div><h2>Connect another service</h2><p class="resource-subtitle">Authentication and permissions will be added as integrations are enabled.</p><div class="command-tool-grid">'+["AWS","Azure","Google Cloud","Gmail","Google Calendar","Slack","Notion","Linear","Jira","Microsoft 365","OpenAI","Anthropic","Google Gemini","Groq","xAI"].map(x=>'<button class="command-tool-placeholder"><span>＋</span><div><strong>'+x+'</strong><small>Integration</small></div><em>Coming soon</em></button>').join("")+'</div></div></div>';host.querySelectorAll("[data-close-command-tool]").forEach(b=>b.onclick=()=>host.innerHTML="")}
function showCommandNode(key){const names={github:"GitHub",vercel:"Vercel",supabase:"Supabase",stripe:"Stripe"};const host=document.getElementById("commandToolModal");if(host)host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-command-tool></div><div class="resource-dialog"><button class="resource-close" data-close-command-tool>×</button><div class="eyebrow">CONNECTION</div><h2>'+names[key]+'</h2><p class="resource-subtitle">Use Connections to configure accounts and resource scope.</p><div class="form-actions"><button class="primary" data-open-connections>Open Connections</button></div></div></div>';document.querySelector("[data-open-connections]")?.addEventListener("click",()=>{host.innerHTML="";render("connections")})}
function bindCommandCenter(){document.querySelectorAll("[data-command-diagnostic]").forEach(b=>b.onclick=runCommandDiagnostic);document.querySelectorAll("[data-command-add-tool]").forEach(b=>b.onclick=openCommandToolModal);document.querySelectorAll("[data-command-node]").forEach(b=>b.onclick=()=>showCommandNode(b.dataset.commandNode));document.querySelectorAll("[data-analytics-series]").forEach(b=>b.onchange=renderAnalytics);document.getElementById("analyticsRange")?.addEventListener("change",renderAnalytics);renderAnalytics();}

let newsletterDraft=null;

const newsletterTemplates=[
 {key:"weekly-update",name:"Weekly Business Update",description:"Clean executive update with highlights, priorities and next steps.",sections:[
  {heading:"This Week",text:"Share the most important update from your business this week.",image:""},
  {heading:"Highlights",text:"Add your wins, launches, customer updates or useful news.",image:""},
  {heading:"Next Steps",text:"Tell readers what is coming next.",image:""}
 ]},
 {key:"product-news",name:"Product & Company News",description:"Product announcements, launches and customer-facing news.",sections:[
  {heading:"What’s New",text:"Introduce the latest product, feature or announcement.",image:""},
  {heading:"Why It Matters",text:"Explain the value in a few clear sentences.",image:""},
  {heading:"Learn More",text:"Add a call to action, link or next step.",image:""}
 ]},
 {key:"newsletter",name:"Modern Newsletter",description:"Flexible newsletter with a hero, stories and a closing CTA.",sections:[
  {heading:"Featured Story",text:"Your main newsletter story goes here.",image:""},
  {heading:"More To Know",text:"Add another useful story or resource.",image:""},
  {heading:"Stay Connected",text:"Close with a short message and call to action.",image:""}
 ]}
];

function getStarted(){
 return '<section class="getstarted-page">'+
  '<div class="getstarted-hero"><span class="eyebrow">HUDHUD PROGRAMS</span><h1>Get something done.</h1><p>Pick a program. HudHud walks you through the steps, handles the technical work, and keeps the result organized for you.</p></div>'+
  '<div class="program-grid">'+
   '<button class="program-card" data-program="site"><span class="program-icon">🌐</span><span class="program-kicker">LAUNCH</span><h3>Site Online in 3–5 mins</h3><small>You can customize more later with HudHudAI’s help.</small><strong>Start Website →</strong></button>'+
   '<button class="program-card featured" data-program="newsletter"><span class="program-icon">📰</span><span class="program-kicker">AUTOMATION</span><h3>Automated Newsletter</h3><small>Build it, schedule it, send it and monitor every campaign.</small><strong>Start Newsletter →</strong></button>'+
   '<button class="program-card" data-program="video"><span class="program-icon">🎬</span><span class="program-kicker">CREATE</span><h3>AI Video with HudHudAI</h3><small>Walk through the idea, script, style, review and export steps.</small><strong>Create AI Video →</strong></button>'+
  '</div>'+
  '<div class="program-lower"><div class="card"><span class="eyebrow">COMING PROGRAMS</span><h3>More one-click business launches</h3><div class="coming-grid"><span>🖥️ VPS + Gateway</span><span>🤖 AI Agent</span><span>📄 AI PDF</span><span>💳 Payments</span><span>📊 Analytics</span><span>📱 Social Content</span></div></div></div>'+
 '</section>';
}

function newsletterProgram(){
 if(!newsletterDraft)newsletterDraft={step:1,templateKey:"weekly-update",name:"Weekly Business Update",subject:"Weekly Business Update",sections:JSON.parse(JSON.stringify(newsletterTemplates[0].sections)),frequency:"weekly",sendTime:"09:00",days:[1],startDate:new Date().toISOString().slice(0,10),endDate:"",recipientsText:"",status:"draft"};
 const d=newsletterDraft;
 const step=d.step;
 let body="";
 if(step===1){
  body='<div class="program-step-panel"><div class="template-grid">'+newsletterTemplates.map(t=>'<button class="template-option '+(d.templateKey===t.key?"selected":"")+'" data-news-template="'+t.key+'"><span>'+esc(t.name)+'</span><small>'+esc(t.description)+'</small></button>').join("")+'</div><label class="wizard-label">Newsletter name<input id="nlName" value="'+esc(d.name)+'" placeholder="My Newsletter"></label><label class="wizard-label">Email subject<input id="nlSubject" value="'+esc(d.subject)+'" placeholder="What readers will see in their inbox"></label></div>';
 }else if(step===2){
  body='<div class="program-step-panel"><div class="wizard-hint">Choose the sections, text and image URLs HudHud should use. Images can be changed later.</div><div class="newsletter-sections">'+d.sections.map((s,i)=>'<div class="newsletter-section-editor"><div class="section-number">'+String(i+1).padStart(2,"0")+'</div><div class="section-fields"><input data-nl-heading="'+i+'" value="'+esc(s.heading||"")+'" placeholder="Section heading"><textarea data-nl-text="'+i+'" placeholder="Write the section text…">'+esc(s.text||"")+'</textarea><input data-nl-image="'+i+'" value="'+esc(s.image||"")+'" placeholder="Optional image URL (https://…)">'+(s.image?'<img class="nl-image-preview" src="'+esc(s.image)+'" alt="">':"")+'</div></div>').join("")+'</div><button class="secondary" data-nl-add-section>+ Add section</button></div>';
 }else if(step===3){
  body='<div class="program-step-panel schedule-panel"><label class="wizard-label">Frequency<select id="nlFrequency"><option value="once" '+(d.frequency==="once"?"selected":"")+'>Send once</option><option value="daily" '+(d.frequency==="daily"?"selected":"")+'>Daily</option><option value="weekly" '+(d.frequency==="weekly"?"selected":"")+'>Weekly</option><option value="monthly" '+(d.frequency==="monthly"?"selected":"")+'>Monthly</option></select></label><div class="wizard-two"><label class="wizard-label">First send date<input id="nlStartDate" type="date" value="'+esc(d.startDate)+'"></label><label class="wizard-label">Time<input id="nlSendTime" type="time" value="'+esc(d.sendTime)+'"></label></div><div id="nlDaysWrap" class="days-wrap"><span class="wizard-label">Days</span><div class="day-pills">'+["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((x,i)=>'<label><input type="checkbox" data-nl-day="'+i+'" '+(d.days.includes(i)?"checked":"")+'><span>'+x+'</span></label>').join("")+'</div></div><label class="wizard-label">End date <span class="muted">(optional)</span><input id="nlEndDate" type="date" value="'+esc(d.endDate||"")+'"></label><div class="schedule-preview" id="nlSchedulePreview"></div></div>';
 }else if(step===4){
  body='<div class="program-step-panel"><div class="wizard-hint">Paste one or many recipients. HudHud accepts emails separated by commas, spaces or new lines, and <strong>Name &lt;email@example.com&gt;</strong> format.</div><label class="wizard-label">Recipients<textarea id="nlRecipients" class="bulk-recipients" placeholder="you@example.com&#10;Jane Doe &lt;jane@example.com&gt;">'+esc(d.recipientsText||"")+'</textarea></label><div class="recipient-count" id="nlRecipientCount">0 valid recipients</div></div>';
 }else{
  const count=parseRecipients(d.recipientsText).length;
  body='<div class="program-step-panel"><div class="review-grid"><div><span>Template</span><strong>'+esc((newsletterTemplates.find(t=>t.key===d.templateKey)||{}).name||"Custom")+'</strong></div><div><span>Subject</span><strong>'+esc(d.subject)+'</strong></div><div><span>Schedule</span><strong>'+esc(newsletterScheduleLabel(d))+'</strong></div><div><span>Recipients</span><strong>'+count+' contacts</strong></div></div><div class="review-preview"><div class="newsletter-preview-title">'+esc(d.subject)+'</div>'+d.sections.map(s=>'<article>'+(s.image?'<img src="'+esc(s.image)+'" alt="">':"")+'<h3>'+esc(s.heading)+'</h3><p>'+esc(s.text)+'</p></article>').join("")+'</div></div>';
 }
 return '<section class="program-page">'+
  '<div class="program-breadcrumb"><button class="secondary mini-button" data-program-back>← Get Started</button><span>HUDHUD PROGRAM / NEWSLETTER</span></div><div class="card sms-test-card"><div><span class="eyebrow">SMS CONNECTOR TEST</span><h3>Test HudHud SMS</h3><p>Send a live test message to the configured test number. This is separate from newsletter scheduling.</p></div><div class="sms-test-actions"><span class="pill">TEST NUMBER • (714) 696-6259</span><button class="secondary" data-test-sms>Send Test SMS</button></div><div id="smsTestStatus" class="studio-status"></div></div>'+
  '<div class="program-head"><div><span class="eyebrow">AUTOMATED NEWSLETTER</span><h2>Build it once. Let HudHud manage it.</h2><p>Template → content → schedule → recipients → analytics.</p></div><span class="program-status">STEP '+step+' OF 5</span></div>'+
  '<div class="wizard-progress">'+[1,2,3,4,5].map(i=>'<button class="'+(i===step?"active":i<step?"done":"")+'" data-nl-step="'+i+'"><span>'+i+'</span><small>'+["Template","Content","Schedule","Recipients","Review"][i-1]+'</small></button>').join("")+'</div>'+
  body+
  '<div class="wizard-actions"><button class="secondary" data-nl-prev '+(step===1?"disabled":"")+'>Back</button><button class="primary" data-nl-next>'+ (step===5?"Activate Newsletter":"Continue") +'</button></div>'+
  '<div id="nlManagerHost"></div></section>';
}

function parseRecipients(raw){
 const found=[];const re=/([A-ZÀ-ÿ0-9][^,;\\n<]*?)?\\s*<\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})\\s*>|([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})/gi;
 let m;while((m=re.exec(String(raw||"")))){const email=(m[2]||m[3]).toLowerCase();if(!found.some(x=>x.email===email))found.push({email,name:(m[1]||"").trim()});}
 return found;
}
function newsletterScheduleLabel(d){if(d.frequency==="once")return "Once • "+d.startDate+" at "+d.sendTime;if(d.frequency==="daily")return "Daily • "+d.sendTime;if(d.frequency==="monthly")return "Monthly • day "+new Date(d.startDate+"T00:00:00").getDate()+" • "+d.sendTime;return "Weekly • "+(d.days.length?d.days.map(i=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]).join(", "):"choose days")+" • "+d.sendTime;}
function newsletterNextSend(d){
 const base=new Date((d.startDate||new Date().toISOString().slice(0,10))+"T"+(d.sendTime||"09:00")+":00");
 if(Number.isNaN(base.getTime()))return null;
 if(d.frequency==="once")return base.toISOString();
 if(d.frequency==="daily"){if(base<=new Date())base.setDate(base.getDate()+1);return base.toISOString();}
 if(d.frequency==="monthly"){if(base<=new Date())base.setMonth(base.getMonth()+1);return base.toISOString();}
 const days=d.days.length?d.days:[1];let candidate=new Date(base);for(let i=0;i<8;i++){if(candidate>new Date()&&days.includes(candidate.getDay()))return candidate.toISOString();candidate.setDate(candidate.getDate()+1);}return base.toISOString();
}
function newsletterHtml(d){
 return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a">'+d.sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+esc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+esc(s.heading)+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+esc(s.text)+'</p></section>').join("")+'</div>';
}
async function newsletterCloud(){
 if(!currentUser)return {templates:[],contacts:[],newsletters:[],sends:[]};
 const [t,c,n]=await Promise.all([
  supabaseClient.from("hudhud_newsletter_templates").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}),
  supabaseClient.from("hudhud_newsletter_contacts").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}),
  supabaseClient.from("hudhud_newsletters").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false})
 ]);
 const error=[t,c,n].find(x=>x.error)?.error;if(error)throw error;
 const ids=(n.data||[]).map(x=>x.id);
 let sends=[];if(ids.length){const s=await supabaseClient.from("hudhud_newsletter_sends").select("*").in("newsletter_id",ids).order("scheduled_for",{ascending:false}).limit(200);if(s.error)throw s.error;sends=s.data||[];}
 return {templates:t.data||[],contacts:c.data||[],newsletters:n.data||[],sends};
}
async function newsletterManagerHtml(){
 try{
  const data=await newsletterCloud();
  if(!data.newsletters.length)return '<div class="card newsletter-manager"><div class="muted">NEWSLETTER MANAGER</div><h3>No newsletters yet</h3><p>Create your first newsletter above. Once activated, HudHud will keep the schedule and send history here.</p></div>';
  return '<div class="newsletter-manager"><div class="manager-head"><div><span class="eyebrow">NEWSLETTER MANAGER</span><h3>Your automations</h3></div><span class="muted">'+data.newsletters.length+' campaign(s)</span></div><div class="newsletter-stats"><div class="card"><span>ACTIVE</span><strong>'+data.newsletters.filter(x=>x.status==="scheduled").length+'</strong></div><div class="card"><span>SENDS</span><strong>'+data.sends.filter(x=>x.status==="sent").length+'</strong></div><div class="card"><span>RECIPIENTS</span><strong>'+data.newsletters.reduce((a,x)=>a+0,0)+'</strong></div></div><div class="newsletter-list">'+data.newsletters.map(n=>{const sends=data.sends.filter(s=>s.newsletter_id===n.id),last=sends.find(s=>s.status==="sent");return '<article class="newsletter-manager-row"><div><div class="manager-title">'+esc(n.name)+'</div><div class="manager-meta">'+esc(n.subject)+' • '+esc(n.frequency)+' • '+(n.next_send_at?new Date(n.next_send_at).toLocaleString():"No next send")+'</div><div class="manager-badges"><span class="pill">'+esc(n.status)+'</span><span class="pill">'+sends.filter(s=>s.status==="sent").length+' sent</span><span class="pill">'+(last?.recipient_count||0)+' last recipients</span></div></div><div class="manager-actions">'+(n.status==="scheduled"?'<button class="secondary" data-nl-pause="'+n.id+'">Pause</button>':'<button class="secondary" data-nl-resume="'+n.id+'">Resume</button>')+'<button class="secondary" data-nl-send="'+n.id+'">Send now</button><button class="danger" data-nl-delete="'+n.id+'">Delete</button></div></article>';}).join("")+'</div><div class="card newsletter-analytics"><div class="muted">NEWSLETTER ANALYTICS</div><h3>What went out, when, and to whom</h3><div class="send-history">'+(data.sends.length?data.sends.slice(0,30).map(s=>'<div class="send-history-row"><span>'+new Date(s.sent_at||s.scheduled_for).toLocaleString()+'</span><strong>'+esc(data.newsletters.find(n=>n.id===s.newsletter_id)?.name||"Newsletter")+'</strong><span>'+s.recipient_count+' recipients</span><span class="pill">'+esc(s.status)+'</span></div>').join(""):'<span class="muted">No sends recorded yet.</span>')+'</div></div></div>';
 }catch(e){return '<div class="card"><strong>Newsletter manager could not load.</strong><p>'+esc(e.message||String(e))+'</p></div>';}
}
async function bindGetStarted(){
 document.querySelectorAll("[data-program]").forEach(b=>b.onclick=()=>{newsletterDraft=null;if(b.dataset.program==="newsletter"){newsletterDraft={step:1,templateKey:"weekly-update",name:"Weekly Business Update",subject:"Weekly Business Update",sections:JSON.parse(JSON.stringify(newsletterTemplates[0].sections)),frequency:"weekly",sendTime:"09:00",days:[1],startDate:new Date().toISOString().slice(0,10),endDate:"",recipientsText:"",status:"draft"};render("newsletter");}else if(b.dataset.program==="site")render("siteprogram");else render("videoprogram");});
}
function siteProgram(){return '<section class="program-page"><div class="program-breadcrumb"><button class="secondary mini-button" data-program-back>← Get Started</button></div><div class="program-head"><div><span class="eyebrow">WEBSITE LAUNCH</span><h2>Site Online in 3–5 mins</h2><p class="program-subline">You can customize more later with HudHudAI’s help.</p></div></div><div class="simple-program-steps">'+["Tell HudHud about your business","Choose a starter design","Generate the site","Connect GitHub / Vercel","Publish and verify"].map((x,i)=>'<div><span>'+String(i+1).padStart(2,"0")+'</span><strong>'+x+'</strong><small>'+ (i===0?"Your name, description and contact details.":i===1?"Pick a clean starter layout.":i===2?"HudHud prepares the website files.":i===3?"Connect your deployment accounts.":"HudHud checks the live URL.")+'</small><button class="secondary" '+(i>0?"disabled":"data-site-start")+'>'+ (i===0?"Start":"Coming next")+'</button></div>').join('')+'</div></section>';}
function videoProgram(){return '<section class="program-page"><div class="program-breadcrumb"><button class="secondary mini-button" data-program-back>← Get Started</button></div><div class="program-head"><div><span class="eyebrow">HUDHUDAI VIDEO</span><h2>Create an AI Video</h2><p class="program-subline">HudHud walks you from idea to a production-ready MP4 workflow.</p></div></div><div class="simple-program-steps">'+["Describe the video","Create the script","Choose visual style","Generate / review","Export MP4"].map((x,i)=>'<div><span>'+String(i+1).padStart(2,"0")+'</span><strong>'+x+'</strong><small>'+ (i===0?"Tell HudHud the goal, audience and message.":i===1?"HudHudAI helps structure the script.":i===2?"Set format, pacing, voice and visual direction.":i===3?"Connect the configured video provider and review the result.":"Export the finished video when approved.")+'</small><button class="secondary" '+(i===0?"data-video-start":"disabled")+'>'+ (i===0?"Start":"Coming next")+'</button></div>').join('')+'</div></section>';}
function bindNewsletter(){
 const d=newsletterDraft;if(!d)return;
 document.querySelectorAll("[data-program-back]").forEach(b=>b.onclick=()=>{newsletterDraft=null;render("getstarted")});
 document.querySelectorAll("[data-nl-step]").forEach(b=>b.onclick=()=>{d.step=Number(b.dataset.nlStep);render("newsletter")});
 document.querySelectorAll("[data-news-template]").forEach(b=>b.onclick=()=>{const t=newsletterTemplates.find(x=>x.key===b.dataset.newsTemplate);if(t){d.templateKey=t.key;d.name=t.name;d.subject=t.name;d.sections=JSON.parse(JSON.stringify(t.sections));render("newsletter")}});
 const name=document.getElementById("nlName"),subject=document.getElementById("nlSubject");if(name)name.oninput=()=>d.name=name.value;if(subject)subject.oninput=()=>d.subject=subject.value;
 document.querySelectorAll("[data-nl-add-section]").forEach(b=>b.onclick=()=>{d.sections.push({heading:"New Section",text:"",image:""});render("newsletter")});
 document.querySelectorAll("[data-nl-heading]").forEach(el=>el.oninput=()=>d.sections[Number(el.dataset.nlHeading)].heading=el.value);
 document.querySelectorAll("[data-nl-text]").forEach(el=>el.oninput=()=>d.sections[Number(el.dataset.nlText)].text=el.value);
 document.querySelectorAll("[data-nl-image]").forEach(el=>el.oninput=()=>{d.sections[Number(el.dataset.nlImage)].image=el.value});
 const freq=document.getElementById("nlFrequency"),date=document.getElementById("nlStartDate"),time=document.getElementById("nlSendTime"),end=document.getElementById("nlEndDate");
 if(freq)freq.onchange=()=>{d.frequency=freq.value;render("newsletter")};if(date)date.onchange=()=>{d.startDate=date.value;updateNewsletterPreview()};if(time)time.onchange=()=>{d.sendTime=time.value;updateNewsletterPreview()};if(end)end.onchange=()=>d.endDate=end.value;
 document.querySelectorAll("[data-nl-day]").forEach(el=>el.onchange=()=>{d.days=Array.from(document.querySelectorAll("[data-nl-day]:checked")).map(x=>Number(x.dataset.nlDay));updateNewsletterPreview()});
 const rec=document.getElementById("nlRecipients");if(rec){rec.oninput=()=>{d.recipientsText=rec.value;const c=document.getElementById("nlRecipientCount");if(c)c.textContent=parseRecipients(rec.value).length+" valid recipients";}}
 document.querySelector("[data-nl-prev]")?.addEventListener("click",()=>{if(d.step>1){d.step--;render("newsletter")}});
 document.querySelector("[data-nl-next]")?.addEventListener("click",async()=>{if(d.step<5){if(d.step===4&&!parseRecipients(d.recipientsText).length){toast("Add at least one valid recipient");return;}d.step++;render("newsletter");return;}await activateNewsletter()});
 document.querySelectorAll("[data-nl-pause]").forEach(b=>b.onclick=()=>updateNewsletterStatus(b.dataset.nlPause,"paused"));
 document.querySelectorAll("[data-nl-resume]").forEach(b=>b.onclick=()=>updateNewsletterStatus(b.dataset.nlResume,"scheduled"));
 document.querySelectorAll("[data-nl-send]").forEach(b=>b.onclick=()=>sendNewsletterNow(b.dataset.nlSend));
 document.querySelectorAll("[data-nl-delete]").forEach(b=>b.onclick=()=>deleteNewsletter(b.dataset.nlDelete));
 const smsTest=document.querySelector("[data-test-sms]");
 if(smsTest)smsTest.onclick=sendTestSms;
 updateNewsletterPreview();
 loadNewsletterManager();
}
function updateNewsletterPreview(){const el=document.getElementById("nlSchedulePreview");if(el&&newsletterDraft)el.textContent="Next send: "+(newsletterNextSend(newsletterDraft)?new Date(newsletterNextSend(newsletterDraft)).toLocaleString():"Choose a valid date and time.");}
async function loadNewsletterManager(){const host=document.getElementById("nlManagerHost");if(host)host.innerHTML=await newsletterManagerHtml();document.querySelectorAll("[data-nl-pause],[data-nl-resume],[data-nl-send],[data-nl-delete]").forEach(b=>{if(b.dataset.nlPause)b.onclick=()=>updateNewsletterStatus(b.dataset.nlPause,"paused");if(b.dataset.nlResume)b.onclick=()=>updateNewsletterStatus(b.dataset.nlResume,"scheduled");if(b.dataset.nlSend)b.onclick=()=>sendNewsletterNow(b.dataset.nlSend);if(b.dataset.nlDelete)b.onclick=()=>deleteNewsletter(b.dataset.nlDelete);});}
async function activateNewsletter(){
 if(!currentUser){showAuthModal("signin");return;}
 const rec=parseRecipients(newsletterDraft.recipientsText);if(!rec.length){toast("Add recipients first");return;}
 if(!newsletterDraft.name||!newsletterDraft.subject){toast("Add a newsletter name and subject");return;}
 const token=await authAccessToken();if(!token){showAuthModal("signin");return;}
 const contacts=[];for(const x of rec){const {data,error}=await supabaseClient.from("hudhud_newsletter_contacts").upsert({user_id:currentUser.id,email:x.email,name:x.name||""},{onConflict:"user_id,email"}).select().single();if(error){toast("Could not save recipients");return;}contacts.push(data);}
 const {data:news,error}=await supabaseClient.from("hudhud_newsletters").insert({user_id:currentUser.id,name:newsletterDraft.name,subject:newsletterDraft.subject,content:{sections:newsletterDraft.sections,templateKey:newsletterDraft.templateKey,html:newsletterHtml(newsletterDraft)},frequency:newsletterDraft.frequency,send_time:newsletterDraft.sendTime+":00",days_of_week:newsletterDraft.days,start_date:newsletterDraft.startDate||null,end_date:newsletterDraft.endDate||null,next_send_at:newsletterNextSend(newsletterDraft),status:"scheduled"}).select().single();
 if(error){toast(error.message);return;}
 const rows=contacts.map(x=>({newsletter_id:news.id,contact_id:x.id}));const {error:rr}=await supabaseClient.from("hudhud_newsletter_recipients").insert(rows);if(rr){toast(rr.message);return;}
 log("Activated newsletter: "+newsletterDraft.name+" for "+rec.length+" recipients");toast("Newsletter activated");newsletterDraft=null;render("newsletter");
}
async function updateNewsletterStatus(id,status){const {data,error}=await supabaseClient.from("hudhud_newsletters").select("*").eq("id",id).eq("user_id",currentUser.id).single();if(error||!data){toast(error?.message||"Newsletter not found");return;}const patch={status,updated_at:new Date().toISOString()};if(status==="scheduled"&&!data.next_send_at)patch.next_send_at=new Date(Date.now()+60000).toISOString();if(status==="paused")patch.next_send_at=null;const {error:updateError}=await supabaseClient.from("hudhud_newsletters").update(patch).eq("id",id).eq("user_id",currentUser.id);if(updateError)toast(updateError.message);else{toast(status==="paused"?"Newsletter paused":"Newsletter resumed");loadNewsletterManager();}}
async function sendTestSms(){
 if(!currentUser){showAuthModal("signin");return;}
 const button=document.querySelector("[data-test-sms]"),status=document.getElementById("smsTestStatus");
 if(button){button.disabled=true;button.textContent="Sending…";}
 if(status)status.textContent="Sending test SMS…";
 try{
  const token=await authAccessToken();
  const r=await fetch("/api/test-sms",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"SMS test failed.");
  if(status)status.textContent="✓ Test SMS sent successfully.";
  toast("Test SMS sent");
 }catch(e){
  if(status)status.textContent="SMS test failed: "+(e.message||"Unknown error.");
  toast(e.message||"SMS test failed");
 }finally{if(button){button.disabled=false;button.textContent="Send Test SMS";}}
}
async function sendNewsletterNow(id){if(!currentUser){showAuthModal("signin");return;}const token=await authAccessToken();const r=await fetch("/api/newsletter-send",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({newsletterId:id})});const d=await r.json().catch(()=>({}));if(!r.ok)toast(d.error||"Send failed");else{toast("Newsletter sent");loadNewsletterManager();}}
async function deleteNewsletter(id){if(!confirm("Delete this newsletter and its send history?"))return;const {error}=await supabaseClient.from("hudhud_newsletters").delete().eq("id",id).eq("user_id",currentUser.id);if(error)toast(error.message);else{toast("Newsletter deleted");loadNewsletterManager();}}

function bindProgramBack(){
 document.querySelectorAll("[data-program-back]").forEach(b=>b.onclick=()=>render("getstarted"));
}

function bindProgramBack(){
 document.querySelectorAll("[data-program-back]").forEach(b=>b.onclick=()=>render("getstarted"));
 document.querySelectorAll("[data-site-start]").forEach(b=>b.onclick=()=>{if(!currentUser){showAuthModal("signin");return;}toast("Website launch workflow ready");});
 document.querySelectorAll("[data-video-start]").forEach(b=>b.onclick=()=>render("studio"));
}
function hudhudFlyby(count=2){
  try{
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const total=Math.max(1,Math.min(3,Number(count)||2));
    for(let n=0;n<total;n++){
      const feather=document.createElement("span");
      feather.className="hudhud-feather";
      feather.setAttribute("aria-hidden","true");
      feather.textContent="🪶";
      feather.style.left=(Math.random()*88+4)+"vw";
      feather.style.setProperty("--feather-drift",((Math.random()-.5)*180)+"px");
      feather.style.setProperty("--feather-duration",(2.4+Math.random()*1.4)+"s");
      feather.style.animationDelay=(n*.18)+"s";
      document.body.appendChild(feather);
      setTimeout(()=>feather.remove(),4300+n*180);
    }
  }catch(e){/* decorative animation must never affect the app */}
}


function devices(){
 return '<section class="devices-page"><div class="section-head"><div><span class="eyebrow">HUDHUD DEVICE MAP</span><h2>Your Devices</h2><span class="muted">Tailscale-connected devices can appear automatically. Everything else is added through the best available authentication method.</span></div><button class="primary" data-device-add>＋ Add device</button></div><div class="device-principles"><div><strong>🛰️ Tailscale</strong><span>Auto-discover trusted devices on your tailnet.</span></div><div><strong>🔐 Best auth</strong><span>OAuth, native permissions, API or HudHud bridge — whichever fits.</span></div><div><strong>📊 Metrics</strong><span>Only the measurements you authorize are collected.</span></div><div><strong>🏃 Activity</strong><span>HudHud uses activity to understand progress and timing.</span></div></div><div class="device-scope card"><div><div class="eyebrow">WHAT HUDHUD USES</div><h3>Metrics + Activity</h3><p>Devices are the connection layer. HudHud turns authorized signals into useful context for goals, planning and proactive help. It does not need unrestricted access to your device.</p></div><div class="scope-chips"><span>Metrics</span><span>Activity</span><span>Last seen</span><span>Permissions</span></div></div><div id="devicesList" class="device-grid"><div class="card muted">Loading your devices…</div></div></section>';
}
async function bindDevices(){
 if(!hasCloudUser())return;
 const host=document.getElementById("devicesList");
 const {data,error}=await supabaseClient.from("hudhud_devices").select("*").eq("user_id",currentUser.id).order("updated_at",{ascending:false});
 if(error){if(host)host.innerHTML='<div class="card">Could not load your devices.</div>';return;}
 const rows=data||[],icon={Desktop:"🖥️",Laptop:"💻",Phone:"📱",Tablet:"📲",Wearable:"⌚",Other:"🔌"};
 const cards=await Promise.all(rows.map(async x=>{
  const [m,a]=await Promise.all([
   supabaseClient.from("hudhud_device_metrics").select("metric_type,value_numeric,unit,recorded_at").eq("device_id",x.id).eq("user_id",currentUser.id).order("recorded_at",{ascending:false}).limit(3),
   supabaseClient.from("hudhud_device_activity").select("activity_type,title,started_at,duration_seconds").eq("device_id",x.id).eq("user_id",currentUser.id).order("started_at",{ascending:false}).limit(2)
  ]);
  const metrics=m.data||[],activities=a.data||[],auto=String(x.connection_method||"").toLowerCase().includes("tailscale");
  const metricHtml=metrics.length?metrics.map(v=>'<span><b>'+esc(v.metric_type)+'</b> '+esc(v.value_numeric)+' '+esc(v.unit||"")+'</span>').join(""):'<span class="muted">No metrics yet</span>';
  const activityHtml=activities.length?activities.map(v=>'<span><b>'+esc(v.title||v.activity_type)+'</b> '+new Date(v.started_at).toLocaleString()+'</span>').join(""):'<span class="muted">No activity yet</span>';
  return '<article class="card device-card"><div class="device-card-top"><div class="device-icon">'+(icon[x.device_type]||"🔌")+'</div><span class="pill '+(auto?"device-auto":"")+'">'+(auto?"🛰️ Auto-discovered":esc(x.status||"Registered"))+'</span></div><div class="device-title-row"><div><h3>'+esc(x.name)+'</h3><p>'+esc([x.manufacturer,x.model,x.platform].filter(Boolean).join(" • ")||x.device_type)+'</p></div><span class="device-live">'+(x.last_seen_at?"● Seen":"○ Waiting")+'</span></div><div class="device-meta"><span>Connection: '+esc(x.connection_method||"Not connected")+'</span><span>Last seen: '+(x.last_seen_at?esc(new Date(x.last_seen_at).toLocaleString()):"—")+'</span></div><div class="device-signal"><div><small>METRICS</small>'+metricHtml+'</div><div><small>ACTIVITY</small>'+activityHtml+'</div></div><div class="device-actions"><button class="secondary" data-device-edit="'+x.id+'">Edit</button><button class="secondary" data-device-connect="'+x.id+'">Connect</button><button class="danger" data-device-delete="'+x.id+'">Remove</button></div></article>';
 }));
 if(host)host.innerHTML=cards.length?cards.join(""):'<div class="empty device-empty"><strong>No devices yet.</strong><span>Add a device or let the HudHud bridge discover one through Tailscale.</span></div>';
 document.querySelectorAll("[data-device-add]").forEach(b=>b.onclick=()=>editDevice(null));
 document.querySelectorAll("[data-device-edit]").forEach(b=>b.onclick=()=>editDevice(rows.find(x=>x.id===b.dataset.deviceEdit)));
 document.querySelectorAll("[data-device-connect]").forEach(b=>b.onclick=()=>{const row=rows.find(x=>x.id===b.dataset.deviceConnect);if(row)toast(String(row.connection_method||"").toLowerCase().includes("tailscale")?"Tailscale discovery is automatic.":"Choose the provider-specific connection method next.");});
 document.querySelectorAll("[data-device-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this device from HudHud?"))return;const {error:e}=await supabaseClient.from("hudhud_devices").delete().eq("id",b.dataset.deviceDelete).eq("user_id",currentUser.id);if(e){toast("Could not remove device");return;}toast("Device removed");render("devices");});
}
async function editDevice(row){
 const type=prompt("Device type (Desktop, Laptop, Phone, Tablet, Wearable, Other):",row?.device_type||"Phone");if(type===null)return;
 const name=prompt("Device name:",row?.name||"My "+type);if(name===null)return;
 const platform=prompt("Platform (macOS, Windows, iOS, Android, watchOS, Fitbit OS, etc.):",row?.platform||"");if(platform===null)return;
 const manufacturer=prompt("Manufacturer:",row?.manufacturer||"");if(manufacturer===null)return;
 const model=prompt("Model:",row?.model||"");if(model===null)return;
 const method=prompt("Connection method (HudHud App, API, Desktop Agent, Manual, etc.):",row?.connection_method||"Manual");if(method===null)return;
 const payload={user_id:currentUser.id,device_type:type.trim()||"Other",name:name.trim()||"Unnamed device",platform:platform.trim()||null,manufacturer:manufacturer.trim()||null,model:model.trim()||null,status:row?.status||"Registered",connection_method:method.trim()||"Manual",permissions:row?.permissions||{},metadata:row?.metadata||{},connected_at:row?.connected_at||null,last_seen_at:row?.last_seen_at||null,updated_at:new Date().toISOString()};
 const q=row?supabaseClient.from("hudhud_devices").update(payload).eq("id",row.id).eq("user_id",currentUser.id):supabaseClient.from("hudhud_devices").insert(payload);
 const {error}=await q;if(error){console.error(error);toast("Could not save device");return;}toast("Device saved");render("devices");
}


function appModalHost(){
 return document.getElementById("appModalHost");
}
function closeAppModal(){
 const host=appModalHost();
 if(host)host.innerHTML="";
}
function contactFormHtml(contact){
 const isEdit=!!contact;
 return '<div class="resource-modal"><div class="resource-backdrop" data-close-app-modal></div><div class="resource-dialog contact-dialog">'+
 '<button type="button" class="resource-close" data-close-app-modal aria-label="Close">×</button>'+
 '<div class="eyebrow">HUDHUD CONTACTS</div><h2>'+(isEdit?"Edit contact":"Create new contact")+'</h2>'+
 '<p class="resource-subtitle">Save this person once and reuse them across SMS, projects and opportunities.</p>'+
 '<form id="contactForm" class="form contact-form">'+
 '<label>Name <span class="required-mark">*</span></label><input name="name" required maxlength="120" value="'+esc(contact?.name||"")+'" placeholder="Jane Doe">'+
 '<div class="contact-form-grid"><div><label>Phone</label><input name="phone" type="tel" maxlength="40" value="'+esc(contact?.phone||"")+'" placeholder="+1 (612) 555-1234"></div>'+
 '<div><label>Email</label><input name="email" type="email" maxlength="160" value="'+esc(contact?.email||"")+'" placeholder="jane@example.com"></div></div>'+
 '<label>Info <span class="muted">(optional)</span></label><textarea name="info" maxlength="1000" placeholder="Company, role, context, notes…">'+esc(contact?.info||"")+'</textarea>'+
 '<div id="contactFormError" class="auth-error"></div>'+
 '<div class="form-actions"><button type="button" class="secondary" data-close-app-modal>Cancel</button><button type="submit" class="primary">'+(isEdit?"Save changes":"Create contact")+'</button></div>'+
 '</form></div></div>';
}
function openContactModal(contact=null,onSaved=null){
 const host=appModalHost();if(!host)return;
 host.innerHTML=contactFormHtml(contact);
 host.querySelectorAll("[data-close-app-modal]").forEach(b=>b.onclick=closeAppModal);
 const form=host.querySelector("#contactForm");
 form.onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(form),name=String(f.get("name")||"").trim(),phone=String(f.get("phone")||"").trim(),email=String(f.get("email")||"").trim(),info=String(f.get("info")||"").trim();
  const error=host.querySelector("#contactFormError");
  if(!name){if(error)error.textContent="Name is required.";return;}
  if(!phone&&!email){if(error)error.textContent="Add a phone number or email address.";return;}
  const button=form.querySelector("button[type=submit]");button.disabled=true;button.textContent=contact?"Saving…":"Creating…";
  try{
   const payload={user_id:currentUser.id,name,phone:phone||null,email:email||null,info:info||null,updated_at:new Date().toISOString()};
   const query=contact
    ?supabaseClient.from("hudhud_contacts").update(payload).eq("id",contact.id).eq("user_id",currentUser.id)
    :supabaseClient.from("hudhud_contacts").insert(payload);
   const {data,error:dbError}=await query.select("*").single();
   if(dbError)throw dbError;
   closeAppModal();toast(contact?"Contact updated":"Contact created");if(onSaved)await onSaved(data);
  }catch(err){if(error)error.textContent=err.message||"Could not save contact.";button.disabled=false;button.textContent=contact?"Save changes":"Create contact";}
 };
}
function contactPickerHtml(contacts,selectedIds=new Set(),label="Recipients"){
 return '<div class="contact-picker"><div class="contact-picker-head"><strong>'+esc(label)+'</strong><span>'+contacts.length+' contact(s)</span></div><div class="contact-picker-search"><input id="contactPickerSearch" class="hudhud-input" placeholder="Search contacts…"></div><div id="contactPickerList" class="contact-picker-list">'+
 (contacts.length?contacts.map(x=>'<label class="contact-picker-row" data-contact-search="'+esc((x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase())+'"><input type="checkbox" data-picker-contact="'+esc(x.id)+'" '+(selectedIds.has(x.id)?"checked":"")+'><span class="conversation-avatar">'+esc((x.name||"?").slice(0,1).toUpperCase())+'</span><span><strong>'+esc(x.name)+'</strong><small>'+esc(x.phone||x.email||"No phone/email")+'</small></span></label>').join(""):'<div class="empty"><strong>No contacts yet.</strong><span>Create a contact to use them here.</span></div>')+
 '</div></div>';
}
function openContactPickerModal(mode,contextId=null){
 const host=appModalHost();if(!host)return;
 const title=mode==="message"?"New SMS message":mode==="project"?"Project members":"Opportunity members";
 const description=mode==="message"?"Choose one or more saved contacts, then send the same SMS to everyone selected.":mode==="project"?"Choose contacts who should be members of this project.":"Choose contacts who should be members of this opportunity.";
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-picker></div><div class="resource-dialog contact-picker-dialog"><button class="resource-close" data-close-picker>×</button><div class="eyebrow">CONTACTS</div><h2>'+title+'</h2><p class="resource-subtitle">'+description+'</p><div id="contactPickerMount" class="contact-picker-loading">Loading contacts…</div><div class="form-actions"><button type="button" class="secondary" data-close-picker>Cancel</button><button type="button" class="primary" id="contactPickerSave">'+(mode==="message"?"Continue":"Save members")+'</button></div></div></div>';
 host.querySelectorAll("[data-close-picker]").forEach(b=>b.onclick=closeAppModal);
 const mount=host.querySelector("#contactPickerMount"),saveButton=host.querySelector("#contactPickerSave");
 const load=async()=>{
  const {data,error}=await supabaseClient.from("hudhud_contacts").select("*").eq("user_id",currentUser.id).eq("status","active").order("name");
  if(error){mount.innerHTML='<div class="empty"><strong>Could not load contacts.</strong><span>'+esc(error.message||"Unknown error")+'</span></div>';saveButton.disabled=true;return;}
  let existingIds=new Set();
  if(mode==="project"){
   const {data:rows}=await supabaseClient.from("hudhud_project_members").select("contact_id").eq("user_id",currentUser.id).eq("project_id",contextId);
   existingIds=new Set((rows||[]).map(x=>x.contact_id));
  }else if(mode==="opportunity"){
   const {data:rows}=await supabaseClient.from("hudhud_opportunity_members").select("contact_id").eq("user_id",currentUser.id).eq("opportunity_id",contextId);
   existingIds=new Set((rows||[]).map(x=>x.contact_id));
  }
  mount.innerHTML=contactPickerHtml(data||[],existingIds,mode==="message"?"Recipients":"Members");
  const search=mount.querySelector("#contactPickerSearch");
  const applySearch=()=>{const q=(search?.value||"").trim().toLowerCase();mount.querySelectorAll(".contact-picker-row").forEach(row=>row.hidden=!!q&&!row.dataset.contactSearch.includes(q));};
  if(search)search.oninput=applySearch;
  mount.querySelectorAll("[data-picker-contact]").forEach(input=>input.onchange=()=>{});
  const create=document.createElement("button");create.type="button";create.className="secondary contact-picker-create";create.textContent="＋ New contact";
  create.onclick=()=>openContactModal(null,async()=>{closeAppModal();openContactPickerModal(mode,contextId);});
  mount.appendChild(create);
  saveButton.onclick=async()=>{
   const selected=Array.from(mount.querySelectorAll("[data-picker-contact]:checked")).map(x=>x.dataset.pickerContact);
   if(!selected.length){toast(mode==="message"?"Select at least one recipient.":"Select at least one contact.");return;}
   saveButton.disabled=true;saveButton.textContent=mode==="message"?"Sending…":"Saving…";
   try{
    if(mode==="message"){
      closeAppModal();
      openSmsComposeModal(data.filter(x=>selected.includes(x.id)));
      return;
    }
    const table=mode==="project"?"hudhud_project_members":"hudhud_opportunity_members";
    const foreign=mode==="project"?"project_id":"opportunity_id";
    await supabaseClient.from(table).delete().eq("user_id",currentUser.id).eq(foreign,contextId);
    const rows=selected.map(contactId=>({user_id:currentUser.id,[foreign]:contextId,contact_id:contactId}));
    const {error:insertError}=await supabaseClient.from(table).insert(rows);
    if(insertError)throw insertError;
    closeAppModal();toast("Members saved");render(mode==="project"?"projects":"opportunities");
   }catch(err){toast(err.message||"Could not save members.");saveButton.disabled=false;saveButton.textContent=mode==="message"?"Continue":"Save members";}
  };
 };
 load();
}
function openSmsComposeModal(contacts){
 const host=appModalHost();if(!host)return;
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-sms-compose></div><div class="resource-dialog contact-picker-dialog"><button class="resource-close" data-close-sms-compose>×</button><div class="eyebrow">TWILIO SMS</div><h2>Send message</h2><p class="resource-subtitle">Your message will be sent to the selected saved contacts.</p><div class="selected-recipient-list">'+contacts.map(x=>'<span class="selected-recipient"><span class="conversation-avatar">'+esc((x.name||"?").slice(0,1).toUpperCase())+'</span><span><strong>'+esc(x.name)+'</strong><small>'+esc(x.phone||"No phone number")+'</small></span></span>').join("")+'</div><label>Message</label><textarea id="bulkSmsBody" maxlength="1600" rows="6" placeholder="Type your message…"></textarea><div id="bulkSmsError" class="auth-error"></div><div class="form-actions"><button type="button" class="secondary" data-close-sms-compose>Cancel</button><button type="button" class="primary" id="bulkSmsSend">Send SMS</button></div></div></div>';
 host.querySelectorAll("[data-close-sms-compose]").forEach(b=>b.onclick=closeAppModal);
 host.querySelector("#bulkSmsSend").onclick=async()=>{
  const body=host.querySelector("#bulkSmsBody").value.trim(),error=host.querySelector("#bulkSmsError"),button=host.querySelector("#bulkSmsSend");
  if(!body){if(error)error.textContent="Message is required.";return;}
  const sendable=contacts.filter(x=>x.phone);
  const withoutPhone=contacts.filter(x=>!x.phone);
  if(!sendable.length){if(error)error.textContent="None of the selected contacts has a phone number.";return;}
  button.disabled=true;button.textContent="Sending…";
  try{
   const token=await authAccessToken();if(!token)throw new Error("Sign in again to send.");
   const results=[];
   for(const contact of sendable){
    const {data:conv,error:convError}=await supabaseClient.from("hudhud_conversations").select("*").eq("user_id",currentUser.id).eq("contact_id",contact.id).eq("channel","sms").eq("status","active").limit(1).maybeSingle();
    if(convError)throw convError;
    let conversation=conv;
    if(!conversation){
      const created=await supabaseClient.from("hudhud_conversations").insert({user_id:currentUser.id,contact_id:contact.id,channel:"sms",status:"active"}).select("*").single();
      if(created.error)throw created.error;conversation=created.data;
    }
    const response=await fetch("/api/sms-send",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({contact_id:contact.id,conversation_id:conversation.id,body})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||("SMS failed for "+contact.name));
    results.push(contact.name);
   }
   closeAppModal();toast("SMS sent to "+results.length+" contact(s)"+(withoutPhone.length?" • "+withoutPhone.length+" skipped without a phone number":""));selectedConversationId=null;render("messages");
  }catch(err){if(error)error.textContent=err.message||"SMS send failed.";button.disabled=false;button.textContent="Send SMS";}
 };
}
function messages(){
 return '<section class="messages-page"><div class="section-head"><div><span class="eyebrow">HUDHUD COMMUNICATIONS</span><h2>Messages</h2><span class="muted">Contacts, conversation history and SMS-ready threads. Save a contact once and reuse it anywhere in HudHud.</span></div><div class="message-head-actions"><button class="secondary" data-sms-number-add>＋ SMS number</button><button class="secondary" data-contact-add>＋ New contact</button><button class="primary" data-message-new>＋ New message</button></div></div><div class="messages-shell card"><aside class="conversation-list"><div class="message-search"><input id="messageSearch" class="hudhud-input" placeholder="Search contacts…"></div><div id="conversationList"><div class="muted">Loading conversations…</div></div></aside><section class="conversation-pane"><div id="conversationHeader" class="conversation-header"><div><strong>Select a conversation</strong><span>Choose a contact to view the thread.</span></div></div><div id="threadMessages" class="thread-messages"><div class="thread-empty"><span>💬</span><strong>Your conversations will live here.</strong><small>HudHud can use authorized replies as structured input — without turning every message into permanent memory.</small></div></div><form id="messageComposer" class="message-composer"><input id="messageInput" class="hudhud-input" maxlength="1600" placeholder="Message…" disabled><button class="primary" disabled>Send</button></form></section></div></section>';
}
let selectedConversationId=null;
async function bindMessages(){
 if(!hasCloudUser())return;
 const list=document.getElementById("conversationList"),search=document.getElementById("messageSearch");let contacts=[],conversations=[];
 const load=async()=>{
  const [c,cv]=await Promise.all([supabaseClient.from("hudhud_contacts").select("*").eq("user_id",currentUser.id).eq("status","active").order("name"),supabaseClient.from("hudhud_conversations").select("*").eq("user_id",currentUser.id).order("last_message_at",{ascending:false,nullsLast:true})]);
  contacts=c.data||[];conversations=cv.data||[];const q=(search?.value||"").trim().toLowerCase();const visible=contacts.filter(x=>!q||String(x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase().includes(q));
  if(list)list.innerHTML=visible.length?visible.map(contact=>{const conv=conversations.find(v=>v.contact_id===contact.id);return '<button class="conversation-row '+(conv?.id===selectedConversationId?"active":"")+'" data-conversation="'+esc(conv?.id||"")+'" data-contact="'+esc(contact.id)+'"><span class="conversation-avatar">'+esc((contact.name||"?").slice(0,1).toUpperCase())+'</span><span class="conversation-row-copy"><b>'+esc(contact.name)+'</b><small>'+(conv?esc(conv.channel.toUpperCase())+" • "+esc(conv.status):"No messages yet")+'</small></span></button>';}).join(""):'<div class="empty message-empty"><strong>No contacts yet.</strong><span>Add someone to start a thread.</span></div>';
  document.querySelectorAll("[data-contact]").forEach(b=>b.onclick=()=>openConversation(b.dataset.contact,b.dataset.conversation,contacts));
 };
 if(search)search.oninput=load;
 document.querySelector("[data-message-new]")?.addEventListener("click",()=>openContactPickerModal("message"));
 document.querySelectorAll("[data-contact-add]").forEach(b=>b.onclick=()=>openContactModal(null,()=>load()));
 const smsNumberButton=document.querySelector("[data-sms-number-add]");
 if(smsNumberButton)smsNumberButton.onclick=async()=>{
   const number=prompt("Your Twilio SMS sending number (for inbound replies):","");if(number===null||!number.trim())return;
   const label=prompt("Label (optional):","HudHud SMS");if(label===null)return;
   const {error}=await supabaseClient.from("hudhud_sms_numbers").upsert({user_id:currentUser.id,phone_number:number.trim(),label:label.trim()||"HudHud SMS",status:"active",updated_at:new Date().toISOString()},{onConflict:"phone_number"});
   if(error){toast("Could not register SMS number");return;}toast("SMS number registered");await load();
 };
 await load();
 async function openConversation(contactId,conversationId,allContacts){
  const contact=allContacts.find(x=>x.id===contactId);if(!contact)return;
  if(!conversationId){const {data,error}=await supabaseClient.from("hudhud_conversations").insert({user_id:currentUser.id,contact_id:contact.id,channel:"sms",status:"active"}).select("*").single();if(error){toast("Could not create conversation");return;}conversationId=data.id;}
  selectedConversationId=conversationId;await renderThread(contact,conversationId);await load();
 }
 async function renderThread(contact,conversationId){
  const header=document.getElementById("conversationHeader"),host=document.getElementById("threadMessages"),input=document.getElementById("messageInput"),form=document.getElementById("messageComposer");
  if(header)header.innerHTML='<div class="conversation-person"><span class="conversation-avatar large">'+esc((contact.name||"?").slice(0,1).toUpperCase())+'</span><div><strong>'+esc(contact.name)+'</strong><span>'+esc(contact.phone||contact.email||"No contact channel yet")+'</span></div></div><span class="pill">SMS</span>';
  const {data}=await supabaseClient.from("hudhud_messages").select("*").eq("user_id",currentUser.id).eq("conversation_id",conversationId).order("created_at");
  if(host)host.innerHTML=data?.length?data.map(m=>'<div class="thread-message '+(m.direction==="outbound"?"outbound":"inbound")+'"><div>'+esc(m.body)+'</div><small>'+new Date(m.created_at).toLocaleString()+(m.delivery_status?" • "+esc(m.delivery_status):"")+'</small></div>').join(""):'<div class="thread-empty"><span>🪶</span><strong>Start the conversation.</strong><small>Your messages and replies will appear here.</small></div>';
  if(host)host.scrollTop=host.scrollHeight;
  if(input){input.disabled=!contact.phone;input.placeholder=contact.phone?"Message "+contact.name+"…":"Add a phone number to enable SMS";input.dataset.conversation=conversationId;input.dataset.contact=contact.id;}
  if(form){form.querySelector("button").disabled=!contact.phone;form.onsubmit=async e=>{e.preventDefault();const body=input.value.trim();if(!body)return;const token=await authAccessToken();if(!token){toast("Sign in again to send.");return;}const button=form.querySelector("button");button.disabled=true;try{const rr=await fetch("/api/sms-send",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({contact_id:contact.id,conversation_id:conversationId,body})});const dd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(dd.error||"SMS could not be sent.");input.value="";await renderThread(contact,conversationId);await load();}catch(e){toast(e.message||"SMS failed");}finally{button.disabled=!contact.phone;}};}
 }
}

async function startSocialOAuth(provider){
  if(!currentUser){showAuthModal("signin");return;}
  const button=document.querySelector('[data-social-connect="'+provider+'"]');
  if(button){button.disabled=true;button.textContent="Opening…";}
  try{
    const response=await authorizedFetch("/api/social-connect?provider="+encodeURIComponent(provider),{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Could not start "+provider+" authorization.");
    if(!data.url)throw new Error("Authorization URL was not returned.");
    window.location.assign(data.url);
  }catch(e){
    toast(e.message||"Social authorization failed");
    if(button){button.disabled=false;button.textContent="Connect";}
  }
}
async function disconnectSocial(provider){
  if(!currentUser)return;
  const name={instagram:"Instagram",x:"X",tiktok:"TikTok",linkedin:"LinkedIn"}[provider]||provider;
  if(!confirm("Disconnect "+name+" from HudHud?"))return;
  try{
    const response=await authorizedFetch("/api/social-disconnect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Could not disconnect "+name+".");
    toast(name+" disconnected");
    render("social");
  }catch(e){toast(e.message||"Disconnect failed");}
}
function social(){
 const providers=[
  ["instagram","Instagram","📸","Connect your Instagram account and authorize the profile data HudHud may use."],
  ["x","X","𝕏","Connect your X account for authorized profile and public-post access."],
  ["tiktok","TikTok","🎵","Connect your TikTok account for authorized profile access."],
  ["linkedin","LinkedIn","in","Connect your LinkedIn profile through LinkedIn OpenID Connect."]
 ];
 return '<section class="social-page"><div class="section-head"><div><span class="eyebrow">SOCIAL</span><h2>Your social presence</h2><span class="muted">Real OAuth connections. HudHud only receives the permissions you approve.</span></div><div class="social-summary"><strong id="socialConnectedCount">—</strong><span>connected</span></div></div><div class="social-permission-banner card"><div><strong>🔐 You stay in control</strong><p>Access tokens stay server-side. HudHud’s brain receives connection metadata and scopes, not provider credentials.</p></div></div><div id="socialGrid" class="social-grid">'+providers.map(p=>'<article class="card social-card" data-social-provider="'+p[0]+'"><div class="social-card-top"><div class="social-logo">'+p[2]+'</div><span class="pill social-status">Not connected</span></div><h3>'+p[1]+'</h3><p>'+p[3]+'</p><div class="social-account" data-social-account="'+p[0]+'">—</div><div class="social-actions"><button class="secondary" data-social-connect="'+p[0]+'">Connect</button><button class="secondary" data-social-view="'+p[0]+'" disabled>View</button><button class="secondary" data-social-remove="'+p[0]+'" disabled>Disconnect</button></div></article>').join('')+'</div></section>';
}
async function bindSocial(){
 if(!hasCloudUser())return;
 try{
   const response=await authorizedFetch("/api/social-integrations",{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Could not load Social connections.");
   const rows=data.integrations||[];
   const count=document.getElementById("socialConnectedCount");
   if(count)count.textContent=rows.filter(x=>x.status==="connected").length;
   document.querySelectorAll("[data-social-connect]").forEach(btn=>{
     btn.onclick=()=>startSocialOAuth(btn.dataset.socialConnect);
   });
   rows.forEach(row=>{
     const card=document.querySelector('[data-social-provider="'+row.provider+'"]');
     if(!card)return;
     const status=card.querySelector(".social-status"),acct=card.querySelector('[data-social-account="'+row.provider+'"]');
     if(status){status.textContent=row.status==="connected"?"Connected":(row.status||"Not connected");status.classList.toggle("connected",row.status==="connected");}
     if(acct)acct.textContent=row.account_handle?("@"+row.account_handle):row.display_name||"Connected account";
     const view=card.querySelector('[data-social-view="'+row.provider+'"]');
     const profileUrl=row.metadata?.profile_url||null;
     if(view){view.disabled=!profileUrl;view.onclick=()=>profileUrl&&window.open(profileUrl,"_blank","noopener,noreferrer");}
     const remove=card.querySelector('[data-social-remove="'+row.provider+'"]');
     if(remove){remove.disabled=row.status!=="connected";remove.onclick=()=>disconnectSocial(row.provider);}
     const connect=card.querySelector('[data-social-connect="'+row.provider+'"]');
     if(connect)connect.textContent=row.status==="connected"?"Reconnect":"Connect";
   });
   const params=new URLSearchParams(window.location.search);
   if(params.get("social")){
     const provider=params.get("provider")||"social";
     const message=params.get("message");
     if(params.get("social")==="connected")toast((provider.charAt(0).toUpperCase()+provider.slice(1))+" connected");
     else if(message)toast(message);
     history.replaceState({},document.title,window.location.pathname);
   }
 }catch(e){console.error(e);toast(e.message||"Could not load Social");}
}
function lifemap(){
 return '<section><div class="section-head"><div><span class="eyebrow">HUDHUD LIFEMAP</span><h2>Your LifeMap</h2><span class="muted">The map you define about your life — goals, routines, people, projects and priorities. This is separate from what HudHud infers or learns.</span></div><button class="primary" data-lifemap-add>Add item</button></div><div class="knowledge-separation"><div><strong>🗺️ LifeMap</strong><span>User-defined structure, plans and context.</span></div><div><strong>🧠 What HudHud Knows</strong><span>Observed or learned information with its own metadata.</span></div></div><div id="lifemapList" class="knowledge-list"><div class="card muted">Loading your LifeMap…</div></div></section>';
}
async function bindLifeMap(){
 if(!hasCloudUser())return;
 const {data,error}=await supabaseClient.from("hudhud_lifemap").select("*").eq("user_id",currentUser.id).order("updated_at",{ascending:false});
 const host=document.getElementById("lifemapList"); if(error){if(host)host.innerHTML='<div class="card">Could not load LifeMap.</div>';return;}
 if(host)host.innerHTML=data?.length?data.map(x=>'<article class="card knowledge-card"><div><span class="eyebrow">'+esc(x.category)+'</span><h3>'+esc(x.title)+'</h3><p>'+esc(x.value)+'</p><small>Updated '+new Date(x.updated_at).toLocaleString()+'</small></div><div class="knowledge-actions"><button class="secondary" data-lifemap-edit="'+x.id+'">Edit</button><button class="secondary" data-lifemap-delete="'+x.id+'">Remove</button></div></article>').join(""):'<div class="empty"><strong>Your LifeMap is empty.</strong><span>Add the things you want HudHud to understand as your intentional life structure.</span></div>';
 document.querySelectorAll("[data-lifemap-add]").forEach(b=>b.onclick=()=>editLifeMap(null));
 document.querySelectorAll("[data-lifemap-edit]").forEach(b=>b.onclick=()=>editLifeMap(data.find(x=>x.id===b.dataset.lifemapEdit)));
 document.querySelectorAll("[data-lifemap-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this LifeMap item?"))return;await supabaseClient.from("hudhud_lifemap").delete().eq("id",b.dataset.lifemapDelete).eq("user_id",currentUser.id);render("lifemap");});
}
async function editLifeMap(row){
 const category=prompt("Category (Goals, Routine, Work, People, Priorities, etc.):",row?.category||""); if(category===null)return;
 const title=prompt("Title:",row?.title||""); if(title===null)return;
 const value=prompt("Details:",row?.value||""); if(value===null)return;
 const payload={user_id:currentUser.id,category:category.trim(),title:title.trim(),value:value.trim(),status:row?.status||"Active",metadata:row?.metadata||{},updated_at:new Date().toISOString()};
 const q=row?supabaseClient.from("hudhud_lifemap").update(payload).eq("id",row.id).eq("user_id",currentUser.id):supabaseClient.from("hudhud_lifemap").insert(payload);
 const {error}=await q;if(error){toast("Could not save LifeMap item");return;}toast("LifeMap updated");render("lifemap");
}
function knowledge(){
 return '<section><div class="section-head"><div><span class="eyebrow">HUDHUD MEMORY / OBSERVATIONS</span><h2>What HudHud Knows</h2><span class="muted">A living report of information HudHud has learned or observed. Each item carries its own source, confidence, timestamps and usage metadata.</span></div><button class="primary" data-knowledge-add>Add observation</button></div><div class="knowledge-notice card"><strong>🧠 Separate from LifeMap</strong><p>LifeMap describes the user-defined life structure. This page describes HudHud’s evolving knowledge. HudHud can update, retire or remove knowledge as new authorized evidence appears.</p></div><div id="knowledgeList" class="knowledge-list"><div class="card muted">Loading what HudHud knows…</div></div></section>';
}
async function bindKnowledge(){
 if(!hasCloudUser())return;
 const {data,error}=await supabaseClient.from("hudhud_knowledge").select("*").eq("user_id",currentUser.id).eq("user_visible",true).order("updated_at",{ascending:false});
 const host=document.getElementById("knowledgeList"); if(error){if(host)host.innerHTML='<div class="card">Could not load HudHud knowledge.</div>';return;}
 if(host)host.innerHTML=data?.length?data.map(x=>'<article class="card knowledge-card"><div><div class="knowledge-top"><span class="eyebrow">'+esc(x.category)+'</span><span class="pill">'+esc(x.status)+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.value)+'</p><div class="knowledge-meta"><span>Source: '+esc(x.source||"HudHud")+'</span><span>Confidence: '+(x.confidence==null?"—":esc(x.confidence)+"%")+'</span><span>Last observed: '+new Date(x.last_observed_at).toLocaleString()+'</span><span>AI use: '+(x.ai_usable?"Allowed":"Off")+'</span></div></div><div class="knowledge-actions"><button class="secondary" data-knowledge-edit="'+x.id+'">Edit</button><button class="secondary" data-knowledge-delete="'+x.id+'">Remove</button></div></article>').join(""):'<div class="empty"><strong>HudHud has not recorded any visible knowledge yet.</strong><span>Once authorized sources and agent workflows are connected, this becomes the living report HudHud maintains about you.</span></div>';
 document.querySelectorAll("[data-knowledge-add]").forEach(b=>b.onclick=()=>editKnowledge(null));
 document.querySelectorAll("[data-knowledge-edit]").forEach(b=>b.onclick=()=>editKnowledge(data.find(x=>x.id===b.dataset.knowledgeEdit)));
 document.querySelectorAll("[data-knowledge-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this knowledge item?"))return;await supabaseClient.from("hudhud_knowledge").delete().eq("id",b.dataset.knowledgeDelete).eq("user_id",currentUser.id);render("knowledge");});
}
async function editKnowledge(row){
 const category=prompt("Category:",row?.category||""); if(category===null)return;
 const title=prompt("What does HudHud know?:",row?.title||""); if(title===null)return;
 const value=prompt("Details:",row?.value||""); if(value===null)return;
 const source=prompt("Source:",row?.source||"User"); if(source===null)return;
 const confidence=prompt("Confidence 0–100:",row?.confidence??"80"); if(confidence===null)return;
 const payload={user_id:currentUser.id,category:category.trim(),title:title.trim(),value:value.trim(),source:source.trim(),confidence:Math.max(0,Math.min(100,Number(confidence)||0)),status:row?.status||"Active",last_observed_at:new Date().toISOString(),user_visible:true,ai_usable:row?.ai_usable!==false,metadata:row?.metadata||{},updated_at:new Date().toISOString()};
 const q=row?supabaseClient.from("hudhud_knowledge").update(payload).eq("id",row.id).eq("user_id",currentUser.id):supabaseClient.from("hudhud_knowledge").insert(payload);
 const {error}=await q;if(error){toast("Could not save knowledge");return;}toast("HudHud knowledge updated");render("knowledge");
}

function render(view){
 if(["projects","opportunities","connections","documents","activity","premium","social","messages","devices","lifemap","knowledge"].includes(view)&&!requireAuth(view))return;
 document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const m=document.getElementById("main");
 if(!m)return;
 const pages={home:home,projects:projects,opportunities:opportunities,connections:connections,social:social,messages:messages,devices:devices,lifemap:lifemap,knowledge:knowledge,tools:tools,studio:studio,documents:documents,activity:activity,core:core,system:system,premium:premium,command:commandCenter,analytics:commandCenter,getstarted:getStarted,newsletter:newsletterProgram,siteprogram:siteProgram,videoprogram:videoProgram};
 m.innerHTML=(pages[view]||home)();
 hudhudFlyby(view==="home"?1:2);
 bind(view);
 if(view==="home") { bindChat(); bindHomeAuth(); }
 if(view==="core") bindThemeToggle();
 if(view==="studio") bindStudio();
 if(view==="system") bindSystem();
 if(view==="connections") bindConnections();
 if(view==="social") bindSocial();
 if(view==="messages") bindMessages();
 if(view==="projects"||view==="opportunities") bindWorkspaceMembers();
 if(view==="devices") bindDevices();
 if(view==="lifemap") bindLifeMap();
 if(view==="knowledge") bindKnowledge();
 if(view==="premium") bindPremium();
 if(view==="getstarted") bindGetStarted();
 if(view==="newsletter") bindNewsletter();
 if(view==="siteprogram"||view==="videoprogram") bindProgramBack();
 if(view==="command"||view==="analytics"){bindCommandCenter();loadCommandResources();}
}

async function bindPremium(){
 document.querySelectorAll("[data-pricing-mode]").forEach(b=>b.onclick=()=>{
   localStorage.setItem("hudhud_pricing_mode",b.dataset.pricingMode);
   render("premium");
 });
 document.querySelectorAll("[data-premium-plan]").forEach(b=>b.onclick=async()=>{
   const plan=b.dataset.premiumPlan;
   if(plan==="free")return;
   if(!currentUser){showAuthModal("signin");return;}
   const lifetime=localStorage.getItem("hudhud_pricing_mode")==="lifetime";
   const checkoutPlan=lifetime&&plan!=="test"?plan+"_lifetime":plan;
   const status=document.getElementById("premiumStatus");
   b.disabled=true;b.textContent="Opening Stripe…";
   if(status)status.textContent="";
   try{
     const token=await authAccessToken();
     if(!token){showAuthModal("signin");b.disabled=false;b.textContent=lifetime?"Get Lifetime Access":plan==="test"?"Test Checkout · $0.50":plan==="pro"?"Choose Pro":"Choose Premium";return;}
     const r=await fetch("/api/stripe-checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan:checkoutPlan})});
     const d=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(d.error||"Could not start Stripe Checkout.");
     if(d.url)window.location.href=d.url; else throw new Error("Stripe did not return a Checkout URL.");
   }catch(e){
     if(status)status.textContent=e.message||"Checkout failed.";
     b.disabled=false;
     b.textContent=lifetime?"Get Lifetime Access":plan==="test"?"Test Checkout · $0.50":plan==="pro"?"Choose Pro":"Choose Premium";
   }
 });
}
async function loadWorkspaceMembers(kind,id){
 const table=kind==="project"?"hudhud_project_members":"hudhud_opportunity_members";
 const foreign=kind==="project"?"project_id":"opportunity_id";
 const {data,error}=await supabaseClient.from(table).select("contact_id,hudhud_contacts(id,name,phone,email)").eq("user_id",currentUser.id).eq(foreign,id);
 const host=document.querySelector('[data-member-chips="'+kind+'"][data-member-item="'+id+'"]');
 if(!host)return;
 if(error){host.innerHTML='<span class="muted">Could not load members.</span>';return;}
 host.innerHTML=(data||[]).length?data.map(row=>'<span class="project-chip member-chip"><span class="conversation-avatar tiny">'+esc((row.hudhud_contacts?.name||"?").slice(0,1).toUpperCase())+'</span>'+esc(row.hudhud_contacts?.name||"Contact")+'</span>').join(""):'<span class="muted">No members yet.</span>';
}
async function bindWorkspaceMembers(){
 document.querySelectorAll("[data-members-kind]").forEach(b=>b.onclick=()=>openContactPickerModal(b.dataset.membersKind,b.dataset.membersId));
 document.querySelectorAll("[data-member-chips]").forEach(el=>loadWorkspaceMembers(el.dataset.memberChips,el.dataset.memberItem));
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
 document.querySelectorAll("[data-delete-workspace]").forEach(b=>b.onclick=()=>deleteWorkspaceItem(b.dataset.deleteWorkspace,b.dataset.itemId));

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

async function deleteWorkspaceItem(kind,itemId){
 const collection=kind==="project"?state.projects:state.opportunities;
 const item=collection.find(x=>x.id===itemId);
 if(!item)return;
 if(!confirm("Delete "+(kind==="project"?"project":"opportunity")+" “"+item.name+"”? This cannot be undone."))return;
 const ok=kind==="project"?await cloudDeleteProject(item):await cloudDeleteOpportunity(item);
 if(!ok)return;
 const index=collection.indexOf(item);
 collection.splice(index,1);
 delete projectConnections[itemId];
 save();
 log("Deleted "+(kind==="project"?"project":"opportunity")+": "+item.name);
 toast((kind==="project"?"Project":"Opportunity")+" deleted");
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

 const ordinal=n=>{
   const m=String(n||"").toLowerCase().match(/^(\d+)(?:st|nd|rd|th)?$/);
   return m?Number(m[1]):null;
 };
 const findItem=(kind,name)=>{
   const collection=kind==="project"?state.projects:state.opportunities;
   const requested=String(name||"").trim().replace(/^[“"' ]+|[”"' ]+$/g,"").replace(/[.?!]+$/,"");
   if(/^(?:last|latest)$/i.test(requested))return collection[0]||null;
   return collection.find(x=>String(x.name||"").trim().toLowerCase()===requested.toLowerCase())||null;
 };
 const stepCommand=text.match(/\b(?:mark|set|make|change|update)\s+(?:step\s+)?(\d+)(?:st|nd|rd|th)?\s+(?:of|from|in)\s+(?:project\s+)?[“"' ]*([^”"']+?)[”"' ]*\s+(?:to\s+)?(?:done|complete|completed)\b/i);
 if(stepCommand){
   const index=ordinal(stepCommand[1])-1;
   const project=findItem("project",stepCommand[2]);
   if(!project)return {reply:"I couldn't find that project."};
   const step=ensureSteps(project)[index];
   if(!step)return {reply:"Project “"+project.name+"” doesn't have step "+(index+1)+"."};
   if(step.done)return {reply:"Step "+(index+1)+" (“"+step.name+"”) is already done."};
   step.done=true;
   if(project.steps.every(x=>x.done)){project.preDoneStatus=project.preDoneStatus||project.status||"Active";project.status="Done";}
   project.updatedAt=new Date().toISOString();
   save();
   if(!(await cloudUpdateProject(project))){await loadCloudState();return {reply:"I couldn't save that step change."};}
   log("Completed project step: "+project.name+" • "+step.name);
   return {reply:"Done. Step "+(index+1)+" (“"+step.name+"”) in project “"+project.name+"” is marked done."+((project.status==="Done")?" The project is now Done.":"")};
 }

 const deleteMatch=text.match(/\bdelete\s+(?:the\s+)?(?:(last|latest)\s+)?(project|opportunity)(?:\s+[“"' ]*([^”"']+?)[”"' ]*)?\s*$/i);
 if(deleteMatch){
   const kind=deleteMatch[2].toLowerCase(),requested=deleteMatch[3]||deleteMatch[1]||"last";
   const item=findItem(kind,requested);
   if(!item)return {reply:"I couldn't find that "+kind+"."};
   const ok=kind==="project"?await cloudDeleteProject(item):await cloudDeleteOpportunity(item);
   if(!ok)return {reply:"I couldn't delete “"+item.name+"” because the cloud save failed."};
   const collection=kind==="project"?state.projects:state.opportunities;
   collection.splice(collection.indexOf(item),1);
   if(kind==="project")delete projectConnections[item.id];
   save();
   log("Deleted "+kind+": "+item.name);
   return {reply:"Done. I deleted the "+kind+" “"+item.name+"”."};
 }

 const statusUpdate=text.match(/\b(?:update|change|set)\s+(?:project\s*\?:\s*|project\s+)([“"' ]?)([^”"']+?)\1(?:'s)?\s+status\s+(?:to|=)\s*[“"' ]?(planning|active|on hold)[”"']?/i);
 if(statusUpdate){
   const requestedName=String(statusUpdate[2]).trim().replace(/[.?!]+/,"");
   const nextRaw=statusUpdate[3].toLowerCase();
   const nextStatus=nextRaw==="active"?"Active":nextRaw==="on hold"?"On hold":"Planning";
   const project=state.projects.find(p=>String(p.name||"").trim().toLowerCase()===requestedName.toLowerCase());
   if(!project)return {reply:"I couldn't find a project named “"+requestedName+"” in Projects."};
   const previous=project.status||"Recorded";
   project.status=nextStatus;project.updatedAt=new Date().toISOString();save();
   if(!(await cloudUpdateProject(project))){await loadCloudState();return {reply:"I couldn't save that status change."};}
   log("Updated project status: "+project.name+" → "+nextStatus);
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
 const project={id:"project_"+Date.now(),name:name,description:"Created from the HudHud command center.",status:status,createdAt:new Date().toISOString(),steps:[]};
 state.projects.unshift(project);save();
 if(!(await cloudInsertProject(project))){state.projects.shift();save();return {reply:"I couldn't save that project."};}
 log("Created project from HudHud chat: "+name);
 return {reply:"Done. I created the project “"+name+"” with status “"+status+"”. It is now in Projects."};
}

function requiresWorkspaceAuth(message){
 return /\b(?:create|add|update|change|set|delete|remove|mark|complete|finish|reopen)\b[\s\S]*\b(?:project|opportunity|step|connection)\b/i.test(String(message||""));
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
   const r=await authorizedFetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:message})});
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
 if(button){button.disabled=true;button.textContent="↻ Opening authorization…";}
 if(!["github","vercel","supabase"].includes(name)){
   if(button){button.disabled=false;button.textContent="↻ Reauthorize";}
   return;
 }
 window.location.href="/api/connection-oauth?action=start&provider="+encodeURIComponent(name);
}
async function authAccessToken(forceRefresh=false){
 try{
   await initSupabase();
   if(!supabaseClient)return "";
   const {data,error}=await supabaseClient.auth.getSession();
   if(error)throw error;
   const session=data.session;
   if(!session)return "";
   const expiresAt=Number(session.expires_at||0);
   const now=Math.floor(Date.now()/1000);
   if(!forceRefresh && (!expiresAt || expiresAt>now+60))return session.access_token||"";
   const refreshed=await supabaseClient.auth.refreshSession();
   if(refreshed.error)throw refreshed.error;
   return refreshed.data.session?.access_token||"";
 }catch(e){
   console.warn("HudHud auth token recovery failed",e);
   return "";
 }
}
async function authorizedFetch(input,options={},retry=true){
 let token=await authAccessToken(false);
 if(!token)throw new Error("Authentication expired. Please sign in again.");
 const headers=new Headers(options.headers||{});
 headers.set("Authorization","Bearer "+token);
 let response=await fetch(input,{...options,headers});
 if(response.status===401 && retry){
   token=await authAccessToken(true);
   if(!token)throw new Error("Authentication expired. Please sign in again.");
   headers.set("Authorization","Bearer "+token);
   response=await fetch(input,{...options,headers});
 }
 return response;
}
async function resetConnectionSettings(){
 if(!currentUser){showAuthModal("signin");return;}
 if(!confirm("Reset HudHud connection settings? This clears selected resources and project links, but does not revoke your GitHub, Vercel or Supabase authorization."))return;
 try{
   await initSupabase();
   const providerIds=state.connections.filter(x=>["github","vercel","supabase"].includes(x.provider)).map(x=>x.id).filter(Boolean);
   if(providerIds.length){
     const {error}=await supabaseClient.from("hudhud_project_connections").delete().eq("user_id",currentUser.id).in("connection_id",providerIds);
     if(error)throw error;
     const {error:connectionError}=await supabaseClient.from("hudhud_connections").delete().eq("user_id",currentUser.id).in("id",providerIds);
     if(connectionError)throw connectionError;
   }
   state.connections=state.connections.filter(x=>!["github","vercel","supabase"].includes(x.provider));
   Object.keys(projectConnections).forEach(k=>projectConnections[k]=projectConnections[k].filter(x=>!providerIds.includes(x.connection_id)));
   connectionResourceCache={};
   save();
   toast("Connection settings reset");
   await refreshConnections();
   openProviderAccounts();
 }catch(e){
   console.error(e);
   toast("Reset failed: "+(e.message||String(e)));
 }
}
function connectionIcon(provider){return provider==="github"?"🐙":provider==="vercel"?"▲":"⚡";}
async function openConnectionModal(provider){
 if(!currentUser){showAuthModal("signin");return;}
 const host=document.getElementById("connectionModalHost");if(!host)return;
 host.onclick=e=>{
   const close=e.target.closest("[data-close-resource-modal]");
   if(close){e.preventDefault();e.stopPropagation();closeResourceModal();return;}
   const reauth=e.target.closest("[data-resource-reauth]");
   if(reauth){e.preventDefault();e.stopPropagation();connectProviderAccount(provider);}
 };
 host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-resource-modal></div><div class="resource-dialog"><div class="resource-loading"><span class="thinking-feather">🪶</span>Loading '+esc(provider)+' resources…</div></div></div>';
 try{
   const existing=state.connections.find(x=>x.provider===provider)||null;
   const settings=existing?.settings||{};
   const ar=await authorizedFetch("/api/provider-accounts",{cache:"no-store"});
   const ad=await ar.json().catch(()=>({accounts:[]}));
   if(!ar.ok)throw new Error(ad.error||"Could not load connected accounts.");
   const accounts=(ad.accounts||[]).filter(x=>x.provider===provider);
   const accountId=String(settings.account_id||"");
   const query="/api/connection-resources?provider="+encodeURIComponent(provider)+(accountId?"&account_id="+encodeURIComponent(accountId):"");
   const r=await authorizedFetch(query,{cache:"no-store"});
   const raw=await r.text();const data=JSON.parse(raw);if(!r.ok)throw new Error(data.error||"Resource discovery failed");
   connectionResourceCache[provider]=data;
   const selected=new Set(Array.isArray(settings.resources)?settings.resources:[]);
   const selectedProjects=new Set(projectConnectionRowsForProvider(provider).map(x=>x.project_id));
   host.innerHTML='<div class="resource-modal"><div class="resource-backdrop" data-close-resource-modal></div><div class="resource-dialog">'+
     '<button type="button" class="resource-close" data-close-resource-modal aria-label="Close">×</button>'+
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
   const message=e.message||String(e);
   host.querySelector(".resource-dialog").innerHTML='<button class="resource-close" data-close-resource-modal>×</button><div class="eyebrow">CONNECTION ERROR</div><h2>Could not load '+esc(provider)+'</h2><p class="resource-subtitle">'+esc(message)+'</p><div class="form-actions"><button type="button" class="secondary" data-close-resource-modal>Close</button><button type="button" class="primary" data-resource-reauth>↻ Reauthorize '+esc(provider)+'</button></div>';
   host.querySelector("[data-close-resource-modal]").onclick=closeResourceModal;
   host.querySelector("[data-resource-reauth]").onclick=()=>connectProviderAccount(provider);
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
 document.querySelectorAll("[data-connection-reset]").forEach(b=>b.onclick=resetConnectionSettings);
 document.querySelectorAll("[data-connection-reconnect]").forEach(b=>b.onclick=()=>reconnectConnection(b.dataset.connectionReconnect,b));
 document.querySelectorAll("[data-connection-reconnect-all]").forEach(b=>b.onclick=()=>openProviderAccounts());
 refreshConnections();
}
function bindSystem(){document.querySelectorAll("[data-system-action]").forEach(b=>b.onclick=()=>systemAction(b.dataset.systemAction));document.querySelectorAll("[data-system-refresh]").forEach(b=>b.onclick=refreshSystem);const focus=document.getElementById("briefFocus");if(focus){focus.value=localStorage.getItem("hudhud_brief_focus")||"all";focus.onchange=()=>{localStorage.setItem("hudhud_brief_focus",focus.value);renderLiveStats();};}renderLiveStats();refreshSystem();clearInterval(healthTimer);healthTimer=setInterval(refreshSystem,5000);}

function bindHomeAuth(){
 document.querySelectorAll("[data-auth-start]").forEach(b=>b.onclick=async()=>{
   if(currentUser){render("getstarted");return;}
   render("getstarted");
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
 const socialResult=new URLSearchParams(window.location.search).get("social");
 if(socialResult)pendingView="social";
 initSupabase().catch(err=>console.warn("Supabase auth not initialized yet:",err.message));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();