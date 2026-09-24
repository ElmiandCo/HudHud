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
export default async function handler(req,res){
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