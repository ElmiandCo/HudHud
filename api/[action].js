import crypto from "node:crypto";

const cfg={
 github:{id:"HUDHUD_GITHUB_OAUTH_CLIENT_ID",secret:"HUDHUD_GITHUB_OAUTH_CLIENT_SECRET",authorize:"https://github.com/login/oauth/authorize",token:"https://github.com/login/oauth/access_token",scopes:"read:user user:email repo offline_access"},
 vercel:{id:"HUDHUD_VERCEL_OAUTH_CLIENT_ID",secret:"HUDHUD_VERCEL_OAUTH_CLIENT_SECRET",authorize:"https://vercel.com/oauth/authorize",token:"https://api.vercel.com/login/oauth/token",scopes:"openid email profile offline_access"},
 supabase:{id:"HUDHUD_SUPABASE_OAUTH_CLIENT_ID",secret:"HUDHUD_SUPABASE_OAUTH_CLIENT_SECRET",authorize:"https://api.supabase.com/v1/oauth/authorize",token:"https://api.supabase.com/v1/oauth/token",scopes:"projects:read organizations:read secrets:read rest:read"}
};
const base=()=>String(process.env.HUDHUD_SUPABASE_URL||"").replace(/\/+$/,"");
const callback=()=>String(process.env.HUDHUD_PUBLIC_URL||"https://hudhudhqo.vercel.app").replace(/\/+$/,"")+"/api/connection-oauth";
const cookieName="hudhud_oauth_state";
function cookieValue(req,name){const raw=String(req.headers.cookie||"");const m=raw.match(new RegExp("(?:^|;\\s*)"+name.replace(/[.*+?^{}()|[\\]\\\\]/g,"\\\\$&")+"=([^;]*)"));return m?decodeURIComponent(m[1]):"";}
function setCookie(res,name,value,maxAge=600){res.setHeader("Set-Cookie",name+"="+encodeURIComponent(value)+"; Path=/; Max-Age="+maxAge+"; HttpOnly; Secure; SameSite=Lax");}
function clearCookie(res,name){setCookie(res,name,"",-1);}
function html(message,ok=true){
  const safe=String(message).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  return `<!doctype html><html><body style="font-family:system-ui;background:#09080d;color:#eee;display:grid;place-items:center;height:100vh"><div style="max-width:520px;padding:32px;text-align:center"><h2>${ok?"🦉 HudHud account connected":"Connection error"}</h2><p>${safe}</p><button type="button" onclick="window.location.href='/?view=connections'" style="margin-top:16px;padding:12px 18px;border-radius:10px;border:1px solid #5b486b;background:#eee8ff;color:#17101f;font-weight:700;cursor:pointer">Return to HudHud</button><p style="color:#817a87;font-size:12px">Returning to Connections automatically…</p></div><script>setTimeout(()=>window.location.href="/?view=connections",1800)</script></body></html>`;
}
async function formPost(url,body,headers={}){const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json",...headers},body:new URLSearchParams(body)});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data.error_description||data.error||"OAuth token exchange failed.");return data;}
async function userFromBearer(req){const token=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"").trim();const key=process.env.HUDHUD_SUPABASE_KEY;if(!token||!key)throw new Error("HudHud sign-in required.");const r=await fetch(base()+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});if(!r.ok)throw new Error("HudHud sign-in expired. Please sign in again.");return r.json();}
async function saveAccount(user,provider,tokenData,profile){
 const key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error("Provider account storage is not configured. Add HUDHUD_SUPABASE_SERVICE_ROLE_KEY.");
 const accountId=String(profile.id||profile.sub||profile.account_id||crypto.createHash("sha256").update(String(tokenData.access_token)).digest("hex"));
 const payload={user_id:user.id,provider,provider_account_id:accountId,account_name:String(profile.name||profile.login||profile.username||profile.email||provider+" account"),account_email:profile.email||null,avatar_url:profile.avatar_url||profile.picture||null,access_token:tokenData.access_token||null,refresh_token:tokenData.refresh_token||null,token_expires_at:tokenData.expires_in?new Date(Date.now()+Number(tokenData.expires_in)*1000).toISOString():null,metadata:profile,is_active:true,updated_at:new Date().toISOString()};
 const r=await fetch(base()+"/rest/v1/hudhud_provider_accounts",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});
 if(!r.ok){const t=await r.text();throw new Error(t||"Could not save provider account.");}
 return {account_id:accountId,name:payload.account_name};
}
async function oauthHandler(req,res){
 const action=String(req.query?.action||"");
 if(req.method==="GET"&&action==="start"){
   const provider=String(req.query?.provider||"").toLowerCase(), c=cfg[provider];
   if(!c)return res.status(400).send(html("Unknown provider.",false));
   if(!process.env[c.id]||!process.env[c.secret])return res.status(503).send(html(provider+" OAuth is not configured in Vercel yet.",false));
   const state=provider+"."+crypto.randomBytes(24).toString("hex");let statePayload=state;
   if(provider==="supabase"){const verifier=crypto.randomBytes(32).toString("base64url");const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");statePayload=state+"."+verifier;setCookie(res,cookieName,statePayload);const u=new URL(c.authorize);u.searchParams.set("client_id",process.env[c.id]);u.searchParams.set("response_type","code");u.searchParams.set("redirect_uri",callback());u.searchParams.set("scope",c.scopes);u.searchParams.set("state",state);u.searchParams.set("code_challenge",challenge);u.searchParams.set("code_challenge_method","S256");return res.redirect(302,u.toString());}
   setCookie(res,cookieName,state);const u=new URL(c.authorize);u.searchParams.set("client_id",process.env[c.id]);u.searchParams.set("redirect_uri",callback());u.searchParams.set("response_type","code");u.searchParams.set("scope",c.scopes);u.searchParams.set("state",state);return res.redirect(302,u.toString());
 }
 if(req.method==="GET"&&req.query?.code&&req.query?.state){
   const saved=cookieValue(req,cookieName),incoming=String(req.query.state),provider=String(req.query.provider||"");
   const guessed=provider||"";
   return res.status(200).send(`<!doctype html><html><body style="font-family:system-ui;background:#09080d;color:#eee;display:grid;place-items:center;height:100vh"><div><h2>🦉 Connecting to HudHud…</h2><p>Finishing secure authorization.</p></div><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>(async()=>{const p=new URLSearchParams(location.search);const code=p.get("code"),state=p.get("state");let provider=(state||"").split(".")[0]||"${guessed}";const c=await fetch("/api/supabase-config").then(r=>r.json());const s=window.supabase.createClient(c.url,c.key);const session=(await s.auth.getSession()).data.session;if(!session){document.body.innerHTML="<h2>Sign in to HudHud first, then connect the provider.</h2>";return;}const r=await fetch("/api/connection-oauth?action=complete",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({code,state,provider})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Connection failed");document.body.innerHTML="<div style='text-align:center'><h2>🦉 Connected!</h2><p>"+(d.account?.name||"Account")+" is now connected.</p></div>";setTimeout(()=>location.href="/?view=connections",1000);})().catch(e=>{document.body.innerHTML="<div style='font-family:system-ui;background:#09080d;color:#eee;padding:40px'><h2>Connection failed</h2><p>"+e.message+"</p></div>"})</script></body></html>`);
 }
 if(req.method==="POST"&&action==="complete"){
   try{
    const user=await userFromBearer(req), body=req.body||{},provider=String(body.provider||"").toLowerCase(),c=cfg[provider],saved=cookieValue(req,cookieName),incoming=String(body.state||"");
    if(!c||!saved||!incoming||saved.split(".")[0]!==incoming)throw new Error("OAuth state validation failed. Start the connection again.");
    const verifier=provider==="supabase"?saved.split(".").slice(1).join("."):undefined;
    const tokenData=await formPost(c.token,{client_id:process.env[c.id],client_secret:process.env[c.secret],code:String(body.code||""),redirect_uri:callback(),grant_type:"authorization_code",...(verifier?{code_verifier:verifier}:{} )});
    let profile={};
    if(provider==="github"){profile=await fetch("https://api.github.com/user",{headers:{Authorization:"Bearer "+tokenData.access_token,Accept:"application/vnd.github+json"}}).then(r=>r.json());}
    else if(provider==="vercel"){profile=await fetch("https://api.vercel.com/login/oauth/userinfo",{headers:{Authorization:"Bearer "+tokenData.access_token}}).then(r=>r.json());}
    else {const orgs=await fetch("https://api.supabase.com/v1/organizations",{headers:{Authorization:"Bearer "+tokenData.access_token}}).then(r=>r.json());const projects=await fetch("https://api.supabase.com/v1/projects",{headers:{Authorization:"Bearer "+tokenData.access_token}}).then(r=>r.json());profile={id:(orgs||[]).map(x=>x.id).join(",")||crypto.createHash("sha256").update(String(tokenData.access_token)).digest("hex"),name:(orgs||[])[0]?.name||"Supabase account",organizations:orgs||[],projects:projects||[]};}
    const account=await saveAccount(user,provider,tokenData,profile);clearCookie(res,cookieName);return res.status(200).json({ok:true,account});
   }catch(e){return res.status(400).json({error:e.message||"OAuth connection failed."});}
 }
 return res.status(400).json({error:"Invalid OAuth request."});
}

function cleanBase(value){return String(value||"").trim().replace(/\/+$/,"").replace(/\/(?:rest\/v1|auth\/v1)$/i,"");}
async function jsonFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const text=await r.text();let data={};try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);
  return data;
}
function env(name){return process.env[name]||"";}
async function requireUser(req){
  const base=cleanBase(env("HUDHUD_SUPABASE_URL")),key=env("HUDHUD_SUPABASE_KEY");
  // Management OAuth accounts are used for account-level discovery; the configured project remains the default REST resource source.
  const auth=String(req.headers.authorization||"");
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!base||!key||!token)throw new Error("Authentication required.");
  const r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:`Bearer ${token}`}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
async function providerAccount(req,provider){
  const id=String(req.query?.account_id||"");
  if(!id)return null;
  const service=env("HUDHUD_SUPABASE_SERVICE_ROLE_KEY");
  if(!service)throw new Error("Provider account storage is not configured.");
  const url=cleanBase(env("HUDHUD_SUPABASE_URL"));
  const auth=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"").trim();
  if(!auth)throw new Error("Authentication required.");
  const u=await fetch(url+"/auth/v1/user",{headers:{apikey:env("HUDHUD_SUPABASE_KEY"),Authorization:"Bearer "+auth}});
  if(!u.ok)throw new Error("Authentication expired. Please sign in again.");
  const user=await u.json();
  const r=await fetch(url+"/rest/v1/hudhud_provider_accounts?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&select=provider,access_token,account_name,account_email,provider_account_id",{headers:{apikey:service,Authorization:"Bearer "+service}});
  const rows=await r.json();
  if(!r.ok||!rows[0])throw new Error("Connected provider account not found.");
  if(rows[0].provider!==provider||!rows[0].access_token)throw new Error("Connected provider account is unavailable.");
  return rows[0];
}
async function githubResources(account){
  const fallback=env("HUDHUD_GITHUB_TOKEN");
  if(!account&&!fallback)throw new Error("GitHub connection is not configured.");
  const owner=env("HUDHUD_GITHUB_OWNER")||"ElmiAndCo";
  const repo=env("HUDHUD_GITHUB_REPO")||"HudHud";
  const tokens=[account?.access_token,fallback].filter(Boolean);
  let last;
  for(const token of tokens){
    try{
      const data=await jsonFetch("https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&sort=updated",{headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Authorization":"Bearer "+token}});
      const repos=(Array.isArray(data)?data:[]).map(r=>({id:String(r.id),name:r.name,full_name:r.full_name,private:!!r.private,default_branch:r.default_branch||"main",description:r.description||"",html_url:r.html_url||"",permissions:r.permissions||{}}));
      const ensured=repos.some(r=>r.full_name===owner+"/"+repo)?repos:repos.concat([{id:"configured",name:repo,full_name:owner+"/"+repo,private:false,default_branch:"main",description:"Configured HudHud repository",html_url:"https://github.com/"+owner+"/"+repo,permissions:{}}]);
      return {provider:"github",resources:ensured};
    }catch(e){last=e;}
  }
  throw last||new Error("GitHub connection is unavailable.");
}
async function vercelResources(account){
  const fallback=env("HUDHUD_VERCEL_TOKEN");
  if(!account&&!fallback)throw new Error("Vercel connection is not configured.");
  const url=new URL("https://api.vercel.com/v9/projects");
  if(env("HUDHUD_VERCEL_TEAM_ID"))url.searchParams.set("teamId",env("HUDHUD_VERCEL_TEAM_ID"));
  url.searchParams.set("limit","100");
  const tokens=[account?.access_token,fallback].filter(Boolean);
  let last;
  for(const token of tokens){
    try{
      const data=await jsonFetch(url.toString(),{headers:{Authorization:"Bearer "+token}});
      return {provider:"vercel",resources:(data.projects||[]).map(p=>({id:p.id||p.projectId,name:p.name,framework:p.framework||"",link:p.link||null,latestDeployments:p.latestDeployments||[],targets:p.targets||{},nodeVersion:p.nodeVersion||null}))};
    }catch(e){last=e;}
  }
  throw last||new Error("Vercel connection is unavailable.");
}
async function supabaseResources(account){
  const base=cleanBase(env("HUDHUD_SUPABASE_URL")),key=env("HUDHUD_SUPABASE_KEY");
  if(!base||!key)throw new Error("Supabase connection is not configured.");
  const headers={apikey:key,Authorization:"Bearer "+key};
  let resources=[];
  try{
    const data=await jsonFetch(base+"/rest/v1/",{headers});
    const paths=data.paths||{};
    resources=Object.keys(paths).filter(p=>p.startsWith("/")&&!p.startsWith("/rpc/")).map(p=>p.slice(1)).filter(Boolean).map(name=>({id:name,name,type:"table"}));
  }catch{}
  if(!resources.length){
    const known=["hudhud_projects","hudhud_opportunities","hudhud_connections","hudhud_activity","hudhud_project_connections"];
    const checks=await Promise.all(known.map(async name=>{
      try{
        const data=await jsonFetch(base+"/rest/v1/"+encodeURIComponent(name)+"?select=*&limit=1",{headers});
        return data?{id:name,name,type:"table"}:null;
      }catch{return null;}
    }));
    resources=checks.filter(Boolean);
  }
  const match=base.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return {provider:"supabase",project:{ref:match?match[1]:"",url:base},resources};
}
async function resourcesHandler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    await requireUser(req);
    const provider=String(req.query?.provider||"").toLowerCase();
    if(!["github","vercel","supabase"].includes(provider))return res.status(400).json({error:"Unknown connection provider."});
    let account=null;
    try{ account=await providerAccount(req,provider); }
    catch(error){
      const fallbackName=provider==="github"?"HUDHUD_GITHUB_TOKEN":provider==="vercel"?"HUDHUD_VERCEL_TOKEN":"HUDHUD_SUPABASE_URL";
      if(!env(fallbackName))throw error;
    }
    const data=provider==="github"?await githubResources(account):provider==="vercel"?await vercelResources(account):await supabaseResources(account);
    if(account)data.account={id:String(req.query.account_id),name:account.account_name,email:account.account_email||"",provider_account_id:account.provider_account_id};
    return res.status(200).json(data);
  }catch(error){
    const message=error?.message||"Connection resources unavailable.";
    const status=/authentication/i.test(message)?401:503;
    return res.status(status).json({error:message});
  }
}


export async function checkConnection(name){
  if(name==="github") return checkGitHub();
  if(name==="vercel") return checkVercel();
  if(name==="supabase") return checkSupabase();
  throw new Error("Unknown connection: "+name);
}

export async function checkAllConnections(){
  const started=Date.now();
  const result={checkedAt:new Date().toISOString(),connections:{},latencyMs:null};
  const checks=[["github",checkGitHub],["vercel",checkVercel],["supabase",checkSupabase]];
  await Promise.all(checks.map(async([name,fn])=>{result.connections[name]=await fn();}));
  result.latencyMs=Date.now()-started;
  return result;
}

async function statusHandler(req,res){
  if(req.method==="POST"){
    const name=String(req.body?.connection||"").toLowerCase();
    if(!["github","vercel","supabase"].includes(name)){
      return res.status(400).json({error:"Unknown connection. Use github, vercel, or supabase."});
    }
    let last;
    for(let attempt=1;attempt<=3;attempt++){
      last=await checkConnection(name);
      if(last.status==="connected") break;
      if(attempt<3) await new Promise(r=>setTimeout(r,400*attempt));
    }
    return res.status(200).json({connection:name,attempts:3,result:last,attemptedAt:new Date().toISOString()});
  }
  if(req.method!=="GET"){
    res.setHeader("Allow","GET, POST");
    return res.status(405).json({error:"Method not allowed."});
  }
  return res.status(200).json(await checkAllConnections());
}

async function checkGitHub(){
  const token=process.env.HUDHUD_GITHUB_TOKEN;
  const owner=process.env.HUDHUD_GITHUB_OWNER||"ElmiandCo";
  const repo=process.env.HUDHUD_GITHUB_REPO||"HudHud";
  if(!token) return {status:"not_configured",configured:false,active:false,detail:"HUDHUD_GITHUB_TOKEN is not set."};
  const t=Date.now();
  try{
    const r=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{
      headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2026-03-10"},
      signal:AbortSignal.timeout(8000)
    });
    if(!r.ok) return {status:r.status===401||r.status===403?"auth_error":"offline",configured:true,active:false,detail:`GitHub HTTP ${r.status}`,latencyMs:Date.now()-t};
    const d=await r.json();
    return {status:"connected",configured:true,active:true,detail:`${d.full_name||owner+"/"+repo} • ${d.default_branch||"main"}`,latencyMs:Date.now()-t};
  }catch(e){
    return {status:"offline",configured:true,active:false,detail:"GitHub could not be reached.",latencyMs:Date.now()-t};
  }
}

async function checkVercel(){
  const token=process.env.HUDHUD_VERCEL_TOKEN;
  const team=process.env.HUDHUD_VERCEL_TEAM_ID;
  if(!token) return {status:"not_configured",configured:false,active:false,detail:"HUDHUD_VERCEL_TOKEN is not set."};
  const t=Date.now();
  try{
    const url=new URL("https://api.vercel.com/v9/projects");
    if(team) url.searchParams.set("teamId",team);
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
    if(!r.ok) return {status:r.status===401||r.status===403?"auth_error":"offline",configured:true,active:false,detail:`Vercel HTTP ${r.status}`,latencyMs:Date.now()-t};
    const d=await r.json();
    return {status:"connected",configured:true,active:true,detail:`${Array.isArray(d.projects)?d.projects.length:0} accessible project(s)`,latencyMs:Date.now()-t};
  }catch(e){
    return {status:"offline",configured:true,active:false,detail:"Vercel could not be reached.",latencyMs:Date.now()-t};
  }
}

function normalizeSupabaseUrl(value){
  return String(value||"").trim().replace(/\/+$/,"" ).replace(/\/(?:rest\/v1|auth\/v1)$/i,"");
}

async function checkSupabase(){
  const rawBase=process.env.HUDHUD_SUPABASE_URL;
  const base=normalizeSupabaseUrl(rawBase);
  const key=process.env.HUDHUD_SUPABASE_KEY;
  if(!base||!key) return {status:"not_configured",configured:false,active:false,detail:"Supabase server-side connection is not configured."};
  const t=Date.now();
  try{
    const r=await fetch(base.replace(/\/$/,"")+"/auth/v1/health",{
      headers:{apikey:key},
      signal:AbortSignal.timeout(8000)
    });
    if(!r.ok) return {status:r.status===401||r.status===403?"auth_error":"offline",configured:true,active:false,detail:`Supabase HTTP ${r.status} • check HUDHUD_SUPABASE_URL`,latencyMs:Date.now()-t};
    const d=await r.json().catch(()=>({}));
    return {status:"connected",configured:true,active:true,detail:d.name?d.name+" health OK":"Supabase health OK",latencyMs:Date.now()-t};
  }catch(e){
    return {status:"offline",configured:true,active:false,detail:"Supabase could not be reached.",latencyMs:Date.now()-t};
  }
}


function routeName(req){
  const q=String(req.query?.connection||"").toLowerCase();
  if(q) return q;
  const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
  return path.split("/").pop().toLowerCase();
}
async function connectionHandler(req,res){
  const route=routeName(req);
  if(route==="connection-oauth") return oauthHandler(req,res);
  if(route==="connection-resources") return resourcesHandler(req,res);
  if(route==="connection-status") return statusHandler(req,res);
  return res.status(404).json({error:"Unknown connection endpoint."});
}


function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function serviceKey(){return process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"";}
async function userFromRequest(req){
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
 const b=base(),key=process.env.HUDHUD_SUPABASE_KEY;
 if(!token||!b||!key)throw new Error("Authentication required.");
 const r=await fetch(b+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
 if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
 return r.json();
}
async function db(path,options={}){
 const key=serviceKey();if(!base()||!key)throw new Error("Newsletter server storage is not configured.");
 const r=await fetch(base()+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||text||"Database request failed.");
 return data;
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function emailHtml(news){
 const sections=Array.isArray(news.content?.sections)?news.content.sections:[];
 return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a;padding:24px">'+sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+esc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+esc(s.heading||"")+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+esc(s.text||"")+'</p></section>').join("")+'</div>';
}
async function sendNewsletter(news){
 const resend=process.env.RESEND_API_KEY||"";const from=process.env.HUDHUD_EMAIL_FROM||process.env.RESEND_FROM||"";
 if(!resend||!from)throw new Error("Email sending is not configured. Add RESEND_API_KEY and HUDHUD_EMAIL_FROM to the server.");
 const joins=await db("hudhud_newsletter_recipients?select=contact_id&newsletter_id=eq."+encodeURIComponent(news.id));
 const ids=(joins||[]).map(x=>x.contact_id);
 if(!ids.length)throw new Error("This newsletter has no recipients.");
 const contacts=await db("hudhud_newsletter_contacts?select=email,name&id=in.("+ids.join(",")+")");
 const emails=(contacts||[]).filter(x=>x.email).map(x=>({from,to:[x.email],subject:news.subject,html:emailHtml(news),tags:[{name:"hudhud_newsletter",value:String(news.id)}]}));
 if(!emails.length)throw new Error("No valid recipient emails were found.");
 let total=0;
 for(let i=0;i<emails.length;i+=100){
   const batch=emails.slice(i,i+100);
   const r=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"hudhud-newsletter/"+news.id+"/"+Date.now()+"/"+i},body:JSON.stringify(batch)});
   const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
   if(!r.ok)throw new Error(data?.message||"Resend batch send failed.");
   total+=batch.length;
 }
 return total;
}
async function sendHandler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 try{
  const user=await userFromRequest(req);
  const newsletterId=String(req.body?.newsletterId||"");
  if(!newsletterId)return res.status(400).json({error:"newsletterId is required."});
  const rows=await db("hudhud_newsletters?select=*&id=eq."+encodeURIComponent(newsletterId)+"&user_id=eq."+encodeURIComponent(user.id));
  const news=rows?.[0];if(!news)return res.status(404).json({error:"Newsletter not found."});
  const count=await sendNewsletter(news);
  await db("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:new Date().toISOString(),sent_at:new Date().toISOString(),status:"sent",recipient_count:count})});
  return res.status(200).json({ok:true,recipientCount:count});
 }catch(e){return res.status(/Authentication/.test(e.message)?401:503).json({error:e.message||"Newsletter send failed."});}
}

function cronBase(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function cronServiceKey(){return process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"";}
async function cronDb(path,options={}){
 const key=cronServiceKey();if(!cronBase()||!key)throw new Error("Newsletter server storage is not configured.");
 const r=await fetch(cronBase()+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||text||"Database request failed.");return data;
}
function cronEsc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function cronEmailHtml(news){const sections=Array.isArray(news.content?.sections)?news.content.sections:[];return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a;padding:24px">'+sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+cronEsc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+cronEsc(s.heading||"")+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+cronEsc(s.text||"")+'</p></section>').join("")+'</div>';}
async function cronSendNewsletter(news){
 const resend=process.env.RESEND_API_KEY||"";const from=process.env.HUDHUD_EMAIL_FROM||process.env.RESEND_FROM||"";
 if(!resend||!from)throw new Error("Email sending is not configured.");
 const joins=await cronDb("hudhud_newsletter_recipients?select=contact_id&newsletter_id=eq."+encodeURIComponent(news.id));
 const ids=(joins||[]).map(x=>x.contact_id);if(!ids.length)throw new Error("No recipients.");
 const contacts=await cronDb("hudhud_newsletter_contacts?select=email,name&id=in.("+ids.join(",")+")");
 const emails=(contacts||[]).filter(x=>x.email).map(x=>({from,to:[x.email],subject:news.subject,html:cronEmailHtml(news),tags:[{name:"hudhud_newsletter",value:String(news.id)}]}));
 let total=0;
 for(let i=0;i<emails.length;i+=100){const batch=emails.slice(i,i+100);const r=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"hudhud-cron/"+news.id+"/"+news.next_send_at+"/"+i},body:JSON.stringify(batch)});const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}if(!r.ok)throw new Error(d?.message||"Resend send failed.");total+=batch.length;}
 return total;
}
function cronNextAfter(iso,frequency){const d=new Date(iso);if(frequency==="daily")d.setUTCDate(d.getUTCDate()+1);else if(frequency==="weekly")d.setUTCDate(d.getUTCDate()+7);else if(frequency==="monthly")d.setUTCMonth(d.getUTCMonth()+1);else return null;return d.toISOString();}
async function cronHandler(req,res){
 const secret=process.env.CRON_SECRET||"";const auth=String(req.headers.authorization||"");if(secret&&auth!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized."});
 if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 try{
  const due=await cronDb("hudhud_newsletters?select=*&status=eq.scheduled&next_send_at=lte."+encodeURIComponent(new Date().toISOString())+"&order=next_send_at.asc&limit=20");
  const results=[];
  for(const news of due||[]){
   try{
    const count=await cronSendNewsletter(news);
    const sentAt=new Date().toISOString();
    await cronDb("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,sent_at:sentAt,status:"sent",recipient_count:count})});
    const next=cronNextAfter(news.next_send_at,news.frequency);
    const end=next&&news.end_date?new Date(next)>new Date(news.end_date+"T23:59:59Z"):false;
    await cronDb("hudhud_newsletters?id=eq."+encodeURIComponent(news.id),{method:"PATCH",body:JSON.stringify({status:next&&!end?"scheduled":"completed",next_send_at:next&&!end?next:null,updated_at:sentAt})});
    results.push({id:news.id,status:"sent",recipientCount:count,nextSend:next&&!end?next:null});
   }catch(e){
    await cronDb("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,status:"failed",recipient_count:0,error_message:e.message||"Send failed"})}).catch(()=>{});
    results.push({id:news.id,status:"failed",error:e.message||"Send failed"});
   }
  }
  return res.status(200).json({ok:true,checkedAt:new Date().toISOString(),processed:results});
 }catch(e){return res.status(503).json({error:e.message||"Newsletter cron failed."});}
}


function smsBaseUrl(){return String(process.env.HUDHUD_PUBLIC_URL||"").replace(/\/+$/,"");}
function normalizePhone(value){
 const digits=String(value||"").replace(/\D/g,"");
 if(!digits)return "";
 if(digits.length===10)return "+1"+digits;
 if(digits.length===11&&digits.startsWith("1"))return "+"+digits;
 return "+"+digits;
}
async function smsDb(path,{method="GET",body}={}){
 const key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error("SMS storage is not configured.");
 const r=await fetch(base()+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
 const t=await r.text();let data=[];try{data=t?JSON.parse(t):[];}catch{data=[];}if(!r.ok)throw new Error((data&&data.message)||t||"SMS database request failed.");return data;
}
async function twilioSend(to,body){
 const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM_NUMBER;
 if(!sid||!token||!from)throw new Error("Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.");
 const auth=Buffer.from(sid+":"+token).toString("base64");
 const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{method:"POST",headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:normalizePhone(to),From:normalizePhone(from),Body:String(body).slice(0,1600)})});
 const t=await r.text();let data={};try{data=JSON.parse(t)}catch{}if(!r.ok)throw new Error(data.message||"Twilio could not send the message.");return data;
}
function validTwilioSignature(req){
 const token=process.env.TWILIO_AUTH_TOKEN;if(!token)return false;
 const signature=String(req.headers["x-twilio-signature"]||"");
 const url=smsBaseUrl()+"/api/sms-webhook";
 const params=req.body&&typeof req.body==="object"?req.body:{};
 const data=url+Object.keys(params).sort().map(k=>k+String(params[k])).join("");
 const expected=crypto.createHmac("sha1",token).update(data).digest("base64");
 return !!signature&&Buffer.byteLength(signature)===Buffer.byteLength(expected)&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
async function smsSendHandler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 try{
  const user=await userFromBearer(req),body=req.body||{},contactId=String(body.contact_id||""),conversationId=String(body.conversation_id||""),message=String(body.body||"").trim();
  if(!contactId||!message)return res.status(400).json({error:"Contact and message are required."});
  const contacts=await smsDb("hudhud_contacts?id=eq."+encodeURIComponent(contactId)+"&user_id=eq."+encodeURIComponent(user.id)+"&select=*");
  const contact=contacts[0];if(!contact)throw new Error("Contact not found.");
  const conversations=await smsDb("hudhud_conversations?id=eq."+encodeURIComponent(conversationId)+"&user_id=eq."+encodeURIComponent(user.id)+"&contact_id=eq."+encodeURIComponent(contactId)+"&select=*");
  if(!conversations[0])throw new Error("Conversation not found.");
  if(!contact.phone)throw new Error("This contact does not have a phone number.");
  const tw=await twilioSend(contact.phone,message),now=new Date().toISOString();
  const rows=await smsDb("hudhud_messages",{method:"POST",body:{user_id:user.id,conversation_id:conversationId,direction:"outbound",channel:"sms",body:message,provider_message_id:tw.sid||null,delivery_status:tw.status||"queued",sent_at:now,metadata:{provider:"twilio"}}});
  await smsDb("hudhud_conversations?id=eq."+encodeURIComponent(conversationId),{method:"PATCH",body:{last_message_at:now,updated_at:now}});
  return res.status(200).json({ok:true,message:rows[0]||null,provider_id:tw.sid||null});
 }catch(e){return res.status(400).json({error:e.message||"SMS send failed."});}
}
async function smsWebhookHandler(req,res){
 if(req.method!=="POST")return res.status(405).send("Method not allowed.");
 try{
  if(!validTwilioSignature(req))return res.status(403).send("Invalid Twilio signature.");
  const from=normalizePhone(req.body?.From),to=normalizePhone(req.body?.To),body=String(req.body?.Body||"").trim(),sid=String(req.body?.MessageSid||"");
  if(!from||!to||!body)return res.status(400).send("Missing message fields.");
  const owners=await smsDb("hudhud_sms_numbers?phone_number=eq."+encodeURIComponent(to)+"&status=eq.active&select=*");
  const owner=owners[0];if(!owner)return res.status(404).send("HudHud number not registered.");
  const contacts=await smsDb("hudhud_contacts?user_id=eq."+encodeURIComponent(owner.user_id)+"&phone=eq."+encodeURIComponent(from)+"&select=*");
  let contact=contacts[0];
  if(!contact){const created=await smsDb("hudhud_contacts",{method:"POST",body:{user_id:owner.user_id,name:from,phone:from,status:"active",metadata:{source:"sms"}}});contact=created[0];}
  const convs=await smsDb("hudhud_conversations?user_id=eq."+encodeURIComponent(owner.user_id)+"&contact_id=eq."+encodeURIComponent(contact.id)+"&channel=eq.sms&status=eq.active&select=*&limit=1");
  let conv=convs[0];
  if(!conv){const created=await smsDb("hudhud_conversations",{method:"POST",body:{user_id:owner.user_id,contact_id:contact.id,channel:"sms",status:"active"}});conv=created[0];}
  const now=new Date().toISOString();
  await smsDb("hudhud_messages",{method:"POST",body:{user_id:owner.user_id,conversation_id:conv.id,direction:"inbound",channel:"sms",body,provider_message_id:sid||null,delivery_status:"received",received_at:now,metadata:{provider:"twilio",from,to}}});
  await smsDb("hudhud_conversations?id=eq."+encodeURIComponent(conv.id),{method:"PATCH",body:{last_message_at:now,updated_at:now}});
  res.setHeader("Content-Type","text/xml");
  return res.status(200).send("<Response></Response>");
 }catch(e){return res.status(400).send("Webhook failed.");}
}

function bridgeAuthorized(req){
 const secret=String(process.env.HUDHUD_DEVICE_BRIDGE_SECRET||"");
 const supplied=String(req.headers["x-hudhud-bridge-secret"]||"").trim();
 return !!secret&&!!supplied&&Buffer.byteLength(secret)===Buffer.byteLength(supplied)&&crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(supplied));
}
async function deviceIngestHandler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 if(!bridgeAuthorized(req))return res.status(401).json({error:"Device bridge authorization failed."});
 try{
  const body=req.body||{},userId=String(body.user_id||""),device=body.device||{};
  if(!userId||!device.external_id||!device.name)return res.status(400).json({error:"user_id, device.external_id and device.name are required."});
  const method=String(device.connection_method||"Tailscale");
  const deviceRows=await smsDb("hudhud_devices?user_id=eq."+encodeURIComponent(userId)+"&connection_method=eq."+encodeURIComponent(method)+"&external_id=eq."+encodeURIComponent(String(device.external_id))+"&select=id&limit=1");
  const payload={user_id:userId,external_id:String(device.external_id),device_type:String(device.device_type||"Other"),name:String(device.name),platform:device.platform||null,manufacturer:device.manufacturer||null,model:device.model||null,status:String(device.status||"Connected"),connection_method:method,permissions:device.permissions||{metrics:true,activity:true},metadata:device.metadata||{},connected_at:device.connected_at||new Date().toISOString(),last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  let saved;
  if(deviceRows[0]) saved=await smsDb("hudhud_devices?id=eq."+encodeURIComponent(deviceRows[0].id),{method:"PATCH",body:payload});
  else saved=await smsDb("hudhud_devices",{method:"POST",body:payload});
  const deviceId=saved[0]?.id||deviceRows[0]?.id;
  if(deviceId&&Array.isArray(body.metrics)&&body.metrics.length) await smsDb("hudhud_device_metrics",{method:"POST",body:body.metrics.slice(0,25).map(x=>({user_id:userId,device_id:deviceId,metric_type:String(x.metric_type||"metric"),value_numeric:x.value_numeric==null?null:Number(x.value_numeric),unit:x.unit||null,recorded_at:x.recorded_at||new Date().toISOString(),metadata:x.metadata||{}}))});
  if(deviceId&&Array.isArray(body.activity)&&body.activity.length) await smsDb("hudhud_device_activity",{method:"POST",body:body.activity.slice(0,25).map(x=>({user_id:userId,device_id:deviceId,activity_type:String(x.activity_type||"activity"),title:x.title||null,started_at:x.started_at||new Date().toISOString(),ended_at:x.ended_at||null,duration_seconds:x.duration_seconds==null?null:Number(x.duration_seconds),metadata:x.metadata||{}}))});
  return res.status(200).json({ok:true,device_id:deviceId});
 }catch(e){return res.status(400).json({error:e.message||"Device ingest failed."});}
}

function newsletterRoute(req){
  const q=String(req.query?.newsletter||"").toLowerCase();
  if(q) return q;
  const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
  return path.split("/").pop().toLowerCase();
}
async function newsletterHandler(req,res){
  const route=newsletterRoute(req);
  if(route==="newsletter-send") return sendHandler(req,res);
  if(route==="newsletter-cron") return cronHandler(req,res);
  return res.status(404).json({error:"Unknown newsletter endpoint."});
}


function actionName(req){
  const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
  return path.split("/").pop().toLowerCase();
}

export default async function handler(req,res){
  const action=actionName(req);

  if(["connection-oauth","connection-resources","connection-status"].includes(action)){
    return connectionHandler(req,res);
  }

  if(["sms-send"].includes(action)){ return smsSendHandler(req,res); }

  if(action==="device-ingest"){ return deviceIngestHandler(req,res); }

  if(action==="sms-webhook"){ return smsWebhookHandler(req,res); }

  if(["newsletter-send","newsletter-cron"].includes(action)){
    return newsletterHandler(req,res);
  }

  return res.status(404).json({error:"Unknown HudHud API endpoint."});
}
