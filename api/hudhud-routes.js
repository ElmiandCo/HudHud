import { getAuthenticatedUser } from "../lib/hudhud-context.js";
import { buildAuthorizeUrl, setStateCookie } from "../lib/social-oauth.js";

function bearer(req){ return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim(); }
function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function admin(){
  const url=String(process.env.HUDHUD_SUPABASE_URL||"").replace(/\/$/,"");
  const key=String(process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"");
  if(!url||!key)throw new Error("Supabase server credentials are not configured.");
  return {url,key,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"}};
}
async function userFromRequest(req){
  const token=bearer(req), b=base(), key=process.env.HUDHUD_SUPABASE_KEY;
  if(!token||!b||!key)throw new Error("Authentication required.");
  const r=await fetch(b+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
function adminHeaders(){
  const key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error("Provider account storage is not configured. Add HUDHUD_SUPABASE_SERVICE_ROLE_KEY.");
  return {apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
}

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
    if(!["instagram","x","tiktok","linkedin"].includes(provider))return res.status(400).json({error:"Unsupported social provider."});
    const {url,headers}=admin();
    const filter="user_id=eq."+encodeURIComponent(user.id)+"&provider=eq."+encodeURIComponent(provider);
    const tokenDelete=await fetch(url+"/rest/v1/hudhud_oauth_tokens?"+filter,{method:"DELETE",headers});
    if(!tokenDelete.ok)throw new Error("Could not remove stored OAuth credentials.");
    const integrationUpdate=await fetch(url+"/rest/v1/hudhud_integrations?"+filter,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"disconnected",disconnected_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()})});
    if(!integrationUpdate.ok)throw new Error("Could not update integration status.");
    return res.status(200).json({ok:true});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not disconnect social provider."});}
}

async function socialIntegrations(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await getAuthenticatedUser(bearer(req));
    const {url,headers}=admin();
    const r=await fetch(url+"/rest/v1/hudhud_integrations?select=id,provider,category,status,provider_account_id,display_name,account_handle,scopes,capabilities,metadata,connected_at,last_synced_at,expires_at,last_error&user_id=eq."+encodeURIComponent(user.id)+"&category=eq.social&order=updated_at.desc",{headers});
    const data=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error(data.message||"Could not load social integrations.");
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
  const key=process.env.HUDHUD_SUPABASE_KEY||"";
  if(!url||!key)return res.status(503).json({error:"Supabase is not configured."});
  if(key.startsWith("sb_secret_")||key.startsWith("service_role"))return res.status(503).json({error:"HUDHUD_SUPABASE_KEY is a server-only key. Add a Supabase publishable key for browser authentication."});
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
 "social-disconnect":socialDisconnect,
 "social-integrations":socialIntegrations,
 "provider-accounts":providerAccounts,
 "supabase-config":supabaseConfig,
 "system-control":systemControl,
 "test-sms":testSms
};

export default async function handler(req,res){
 const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
 const action=path.split("/").pop().toLowerCase();
 const fn=handlers[action];
 if(!fn)return res.status(404).json({error:"Unknown consolidated HudHud API endpoint."});
 return fn(req,res);
}
