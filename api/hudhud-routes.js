import { getAuthenticatedUser } from "../lib/hudhud-context.js";
import { buildAuthorizeUrl, setStateCookie, clearStateCookie, readStateCookie, exchangeCode, fetchProfile, saveOAuthConnection, callbackRedirect } from "../lib/social-oauth.js";

function bearer(req){ return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim(); }
function cleanBrowserKey(value){
  const key=String(value||"").trim().replace(/^["']|["']$/g,"").replace(/[\s\u0000-\u001F\u007F]/g,"");
  if(!key) return "";
  if(/^sb_secret_/i.test(key) || /^service_role/i.test(key)) throw new Error("Supabase browser key is server-only. Configure HUDHUD_SUPABASE_KEY with the publishable/anon key.");
  return key;
}
function normalizeSupabaseUrl(value){
  return String(value||"").trim()
    .replace(/\/+$/,"")
    .replace(/\/(?:rest\/v1|auth\/v1)$/i,"");
}
function base(){return normalizeSupabaseUrl(process.env.HUDHUD_SUPABASE_URL||process.env.SUPABASE_URL);}
function admin(){
  const url=normalizeSupabaseUrl(process.env.HUDHUD_SUPABASE_URL||process.env.SUPABASE_URL);
  let key=String(process.env.HUDHUD_SUPABASE_SECRET_KEY||process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim().replace(/^["']|["']$/g,"").replace(/[\s\u0000-\u001F\u007F]/g,"");
  if(!key && process.env.SUPABASE_SECRET_KEYS){
    try{const parsed=JSON.parse(String(process.env.SUPABASE_SECRET_KEYS));key=String(parsed?.default||Object.values(parsed||{})[0]||"").trim().replace(/^["']|["']$/g,"").replace(/[\s\u0000-\u001F\u007F]/g,"");}catch{}
  }
  if(!url||!key)throw new Error("Supabase server credentials are not configured.");
  if(/^(sb_publishable_|sb_anon_)/i.test(key))throw new Error("Supabase server credential is a publishable/anon key. Configure a server secret key instead.");
  const headers={apikey:key,"Content-Type":"application/json"};
  if(!/^sb_secret_/i.test(key)) headers.Authorization="Bearer "+key;
  return {url,key,headers};
}
async function userFromRequest(req){
  const token=bearer(req), b=base(), key=cleanBrowserKey(process.env.HUDHUD_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
  if(!token||!b||!key)throw new Error("Authentication required.");
  const r=await fetch(b+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
function adminHeaders(){
  const key=admin().key;
  const headers={apikey:key,"Content-Type":"application/json"};
  if(!/^sb_secret_/i.test(key)) headers.Authorization="Bearer "+key;
  return headers;
}

async function recordXApiUsage(userId, resource, action, providerCostMicrousd, metadata={}){
  try{
    const {url,headers}=admin();
    const prefResponse=await fetch(url+"/rest/v1/hudhud_api_billing_preferences?select=x_enabled,x_fee_microusd&user_id=eq."+encodeURIComponent(userId),{headers});
    const prefs=await prefResponse.json().catch(()=>[]);
    const pref=prefs?.[0]||null;
    const fee=Number(pref?.x_fee_microusd ?? 5000);
    const status=pref?.x_enabled===true?"billable":"pending_consent";
    await fetch(url+"/rest/v1/hudhud_api_usage",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({user_id:userId,provider:"x",resource,action,provider_cost_microusd:Number(providerCostMicrousd),hudhud_fee_microusd:fee,total_microusd:Number(providerCostMicrousd)+fee,quantity:1,status,metadata})});
  }catch(error){console.error("[HudHud Billing] X usage ledger failed:",error?.message||error);}
}
async function xBillingPreference(req,res){
  try{
    const user=await userFromRequest(req),{url,headers}=admin();
    if(req.method==="GET"){
      const r=await fetch(url+"/rest/v1/hudhud_api_billing_preferences?select=*&user_id=eq."+encodeURIComponent(user.id),{headers});
      const rows=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error("Could not load X billing preference.");
      return res.status(200).json({preference:rows?.[0]||null});
    }
    if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed."});}
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const enabled=body.enabled===true;
    const payload={user_id:user.id,x_enabled:enabled,x_consent_at:enabled?new Date().toISOString():null,x_fee_microusd:5000,updated_at:new Date().toISOString()};
    const up=await fetch(url+"/rest/v1/hudhud_api_billing_preferences?on_conflict=user_id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(payload)});
    if(!up.ok)throw new Error("Could not save X billing preference.");
    await fetch(url+"/rest/v1/hudhud_api_usage?user_id=eq."+encodeURIComponent(user.id)+"&provider=eq.x&status=eq.pending_consent",{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:enabled?"billable":"waived"})});
    return res.status(200).json({ok:true,enabled});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:500).json({error:e.message||"X billing preference failed."});}
}
async function xBillingAnalytics(req,res){
  try{
    const user=await userFromRequest(req),{url,headers}=admin();
    const r=await fetch(url+"/rest/v1/hudhud_api_usage?select=provider,resource,action,provider_cost_microusd,hudhud_fee_microusd,total_microusd,status,quantity,created_at&user_id=eq."+encodeURIComponent(user.id)+"&order=created_at.desc&limit=1000",{headers});
    const rows=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error("Could not load API usage.");
    const x=rows.filter(row=>row.provider==="x");
    const sum=(key,statuses)=>x.filter(row=>statuses.includes(row.status)).reduce((n,row)=>n+Number(row[key]||0),0);
    const operations=x.reduce((n,row)=>n+Number(row.quantity||1),0);
    const walletResponse=await fetch(url+"/rest/v1/hudhud_api_wallets?select=balance_microusd,status&user_id=eq."+encodeURIComponent(user.id),{headers});
    const walletRows=await walletResponse.json().catch(()=>[]);
    const wallet=walletRows?.[0]||{balance_microusd:0,status:"active"};
    return res.status(200).json({provider:"x",operations,providerCostMicrousd:sum("provider_cost_microusd",["billable","charged"]),hudhudFeeMicrousd:sum("hudhud_fee_microusd",["billable","charged"]),totalMicrousd:sum("total_microusd",["billable","charged"]),pendingMicrousd:sum("total_microusd",["pending_consent"]),walletBalanceMicrousd:Number(wallet.balance_microusd||0),walletStatus:wallet.status,rows:x.slice(0,100)});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:500).json({error:e.message||"API analytics failed."});}
}
async function stripeConnectStart(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await userFromRequest(req);
    const secret=String(process.env.STRIPE_SECRET_KEY||"").trim();
    if(!secret)throw new Error("Stripe Connect is not configured yet. Add STRIPE_SECRET_KEY to HudHud.");
    const {url,headers}=admin();
    const existing=await fetch(url+"/rest/v1/hudhud_stripe_connected_accounts?select=*&user_id=eq."+encodeURIComponent(user.id),{headers});
    const rows=await existing.json().catch(()=>[]);
    let accountId=rows?.[0]?.stripe_account_id;
    if(!accountId){
      const accountBody=new URLSearchParams({type:"express",country:"US",email:String(user.email||"")});
      const ar=await fetch("https://api.stripe.com/v1/accounts",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body:accountBody});
      const account=await ar.json().catch(()=>({}));
      if(!ar.ok)throw new Error(account?.error?.message||"Stripe could not create the connected account.");
      accountId=account.id;
      await fetch(url+"/rest/v1/hudhud_stripe_connected_accounts",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id,stripe_account_id:account.id,account_type:account.type,charges_enabled:!!account.charges_enabled,payouts_enabled:!!account.payouts_enabled,details_submitted:!!account.details_submitted})});
    }
    const form=new URLSearchParams({account:accountId,refresh_url:"https://hudhudhq.vercel.app/?stripe=refresh",return_url:"https://hudhudhq.vercel.app/?stripe=connected",type:"account_onboarding"});
    const lr=await fetch("https://api.stripe.com/v1/account_links",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body:form});
    const link=await lr.json().catch(()=>({}));
    if(!lr.ok)throw new Error(link?.error?.message||"Stripe onboarding could not start.");
    return res.status(200).json({url:link.url,accountId});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:500).json({error:e.message||"Stripe connection failed."});}
}

async function socialCallback(req,res,provider){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).send("Method not allowed.");}
  try{
    const state=readStateCookie(req);
    if(state.provider!==provider)throw new Error("OAuth provider state mismatch.");
    if(String(req.query?.state||"")!==state.state)throw new Error("OAuth state mismatch.");
    if(req.query?.error)throw new Error(String(req.query.error_description||req.query.error));
    const code=String(req.query?.code||"");
    if(!code)throw new Error("Provider did not return an authorization code.");
    const token=await exchangeCode(req,provider,code,state);
    const profile=await fetchProfile(provider,token.access_token);
    if(provider==="x") await recordXApiUsage(state.user_id,"User","read",10000,{source:"oauth_profile",account_handle:profile?.username||profile?.data?.username||null});
    const account=await saveOAuthConnection(state.user_id,provider,token,profile,req);
    clearStateCookie(res);
    const message=provider==="linkedin" ? account.displayName+" connected" : account.accountHandle ? "Connected @"+account.accountHandle : "Connected";
    return res.redirect(302,callbackRedirect(req,provider,"connected",message));
  }catch(e){
    const safeMessage=String(e?.message||"Social connection failed.").replace(/[\r\n]+/g," ").slice(0,300);
    console.error("[Social OAuth] callback failed:",safeMessage);
    clearStateCookie(res);
    return res.redirect(302,callbackRedirect(req,provider,"error",safeMessage));
  }
}
async function socialCallbackInstagram(req,res){return socialCallback(req,res,"instagram");}
async function socialCallbackTiktok(req,res){return socialCallback(req,res,"tiktok");}
async function socialCallbackX(req,res){return socialCallback(req,res,"x");}
async function socialCallbackLinkedin(req,res){return socialCallback(req,res,"linkedin");}
async function socialCallbackYoutube(req,res){return socialCallback(req,res,"youtube");}

async function socialConnect(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    const provider=String(req.query?.provider||"").toLowerCase();
    const user=await getAuthenticatedUser(bearer(req));
    const {url,statePayload}=buildAuthorizeUrl(req,provider,user.id);
    setStateCookie(res,statePayload);
    return res.status(200).json({url,provider});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not start social authorization."});}
}

async function socialDisconnect(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await getAuthenticatedUser(bearer(req));
    const provider=String(req.body?.provider||req.query?.provider||"").toLowerCase();
    if(!["instagram","x","tiktok","linkedin","youtube"].includes(provider))return res.status(400).json({error:"Unsupported social provider."});
    const {url,headers}=admin();
    const filter="user_id=eq."+encodeURIComponent(user.id)+"&provider=eq."+encodeURIComponent(provider);
    const tokenDelete=await fetch(url+"/rest/v1/hudhud_oauth_tokens?"+filter,{method:"DELETE",headers});
    if(!tokenDelete.ok)throw new Error("Could not remove stored OAuth credentials.");
    const integrationUpdate=await fetch(url+"/rest/v1/hudhud_integrations?"+filter,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"disconnected",disconnected_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()})});
    if(!integrationUpdate.ok)throw new Error("Could not update integration status.");
    return res.status(200).json({ok:true});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not disconnect social provider."});}
}

async function healthSync(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await userFromRequest(req),body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const samples=Array.isArray(body.samples)?body.samples.slice(0,500):[];
    const allowedTypes=new Set(["step_count","active_energy","heart_rate","walking_running_distance","workout","dietary_energy","dietary_protein","sleep"]);
    const normalized=samples.filter(x=>x&&allowedTypes.has(String(x.sample_type||""))&&x.started_at).map(x=>({
      user_id:user.id,provider:"apple_health",sample_type:String(x.sample_type),external_id:x.external_id?String(x.external_id):null,
      value:x.value==null?null:Number(x.value),unit:x.unit?String(x.unit):null,started_at:new Date(x.started_at).toISOString(),
      ended_at:x.ended_at?new Date(x.ended_at).toISOString():null,source_name:x.source_name?String(x.source_name):null,metadata:x.metadata&&typeof x.metadata==="object"?x.metadata:{}
    }));
    const {url,headers}=admin();
    if(normalized.length){
      const up=await fetch(url+"/rest/v1/hudhud_health_samples?on_conflict=user_id,provider,sample_type,external_id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(normalized)});
      if(!up.ok){const detail=await up.text();throw new Error("Could not save health samples: "+detail.slice(0,300));}
    }
    const source={user_id:user.id,provider:"apple_health",status:"connected",permissions:body.permissions&&typeof body.permissions==="object"?body.permissions:{},metadata:body.metadata&&typeof body.metadata==="object"?body.metadata:{},connected_at:new Date().toISOString(),last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const src=await fetch(url+"/rest/v1/hudhud_health_sources?on_conflict=user_id,provider",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(source)});
    if(!src.ok){const detail=await src.text();throw new Error("Could not save health connection: "+detail.slice(0,300));}
    return res.status(200).json({ok:true,synced:normalized.length,provider:"apple_health"});
  }catch(e){return res.status(/Authentication|required/i.test(e.message)?401:500).json({error:e.message||"Health sync failed."});}
}

async function socialIntegrations(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await getAuthenticatedUser(bearer(req));
    const {url,headers}=admin();
    const r=await fetch(url+"/rest/v1/hudhud_integrations?select=id,provider,category,status,provider_account_id,display_name,account_handle,scopes,capabilities,metadata,connected_at,last_synced_at,expires_at,last_error&user_id=eq."+encodeURIComponent(user.id)+"&category=eq.social&order=updated_at.desc",{headers});
    const raw=await r.text();
    let data=[];
    try{data=raw?JSON.parse(raw):[];}catch{data=[];}
    if(!r.ok){
      const detail=data?.message||data?.hint||data?.details||raw||"Unknown Supabase error.";
      throw new Error("Supabase integrations query failed ("+r.status+"): "+String(detail).slice(0,300));
    }
    return res.status(200).json({integrations:data});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not load social integrations."});}
}

async function providerAccounts(req,res){
  try{
    const user=await userFromRequest(req);
    const headers=adminHeaders();
    if(req.method==="GET"){
      const r=await fetch(base()+"/rest/v1/hudhud_provider_accounts?select=id,provider,provider_account_id,account_name,account_email,avatar_url,metadata,is_active,created_at,updated_at&user_id=eq."+encodeURIComponent(user.id)+"&order=created_at.asc",{headers});
      const data=await r.json();
      if(!r.ok)throw new Error(data.message||"Could not load provider accounts.");
      return res.status(200).json({accounts:data});
    }
    if(req.method==="DELETE"){
      const id=String(req.query?.id||"");
      if(!id)return res.status(400).json({error:"Account id is required."});
      const r=await fetch(base()+"/rest/v1/hudhud_provider_accounts?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id),{method:"DELETE",headers});
      if(!r.ok){const d=await r.text();throw new Error(d||"Could not remove provider account.");}
      return res.status(200).json({ok:true});
    }
    res.setHeader("Allow","GET, DELETE");return res.status(405).json({error:"Method not allowed."});
  }catch(e){return res.status(/Authentication/.test(e.message)?401:503).json({error:e.message||"Provider account error."});}
}

async function supabaseConfig(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  const rawUrl=process.env.HUDHUD_SUPABASE_URL||"";
  const url=String(rawUrl).trim().replace(/\/+$/,"").replace(/\/(?:rest\/v1|auth\/v1)$/i,"");
  let key="";
  try{key=cleanBrowserKey(process.env.HUDHUD_SUPABASE_KEY||"");}catch(e){return res.status(503).json({error:e.message});}
  if(!url||!key)return res.status(503).json({error:"Supabase is not configured."});
  return res.status(200).json({url,key});
}

async function systemControl(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  const controlUrl=process.env.HUDHUD_CONTROL_URL,token=process.env.HUDHUD_BRAIN_TOKEN;
  if(!controlUrl||!token)return res.status(503).json({error:"HudHud local control is not configured."});
  const action=typeof req.body?.action==="string"?req.body.action:"";
  const allowed=["health","start-gpt4all","start-tailscale","start-funnel","restart-bridge","start-everything"];
  if(!allowed.includes(action))return res.status(400).json({error:"Unknown system action."});
  try{
    const r=await fetch(controlUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({action})});
    const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{data={message:raw}}
    if(!r.ok)return res.status(r.status).json(data);
    return res.status(200).json(data);
  }catch(error){return res.status(502).json({error:"HudHud local control agent is unreachable."});}
}

async function testSms(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 try{
  await userFromRequest(req);
  const sid=String(process.env.TWILIO_ACCOUNT_SID||"").trim();
  const token=String(process.env.TWILIO_AUTH_TOKEN||"").trim();
  const from=String(process.env.TWILIO_FROM_NUMBER||"").trim();
  const to="7146966259";
  if(!sid||!token||!from)return res.status(503).json({error:"SMS is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to the server environment."});
  const body=new URLSearchParams({To:"+1"+to,From:from,Body:"HudHud SMS test: your SMS connector is working. — HudHud"});
  const auth=Buffer.from(sid+":"+token).toString("base64");
  const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{method:"POST",headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!r.ok)return res.status(502).json({error:data?.message||"Twilio rejected the SMS request."});
  return res.status(200).json({ok:true,status:data.status||"queued"});
 }catch(e){
  const msg=e.message||"SMS test failed.";
  return res.status(/Authentication/.test(msg)?401:500).json({error:msg});
 }
}

const handlers={
 "social-connect":socialConnect,
 "social-callback-instagram":socialCallbackInstagram,
 "social-callback-tiktok":socialCallbackTiktok,
 "social-callback-x":socialCallbackX,
 "social-callback-linkedin":socialCallbackLinkedin,
 "social-callback-youtube":socialCallbackYoutube,
 "social-disconnect":socialDisconnect,
 "social-integrations":socialIntegrations,
 "health-sync":healthSync,
 "provider-accounts":providerAccounts,
 "supabase-config":supabaseConfig,
 "system-control":systemControl,
 "test-sms":testSms,
 "x-billing-preference":xBillingPreference,
 "x-billing-analytics":xBillingAnalytics,
 "stripe-connect-start":stripeConnectStart
};

export default async function handler(req,res){
 const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
 const action=path.split("/").pop().toLowerCase();
 const fn=handlers[action];
 if(!fn)return res.status(404).json({error:"Unknown consolidated HudHud API endpoint."});
 return fn(req,res);
}