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
export default async function handler(req,res){
  const route=routeName(req);
  if(route==="connection-oauth") return oauthHandler(req,res);
  if(route==="connection-resources") return resourcesHandler(req,res);
  if(route==="connection-status") return statusHandler(req,res);
  return res.status(404).json({error:"Unknown connection endpoint."});
}
