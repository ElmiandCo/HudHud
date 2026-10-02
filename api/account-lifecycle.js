import crypto from "node:crypto";

function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"").trim();}
async function supaUser(token){
 const url=process.env.HUDHUD_SUPABASE_URL, key=process.env.HUDHUD_SUPABASE_KEY;
 if(!url||!key)throw new Error("Supabase server configuration is missing.");
 const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d?.id)throw new Error("Authentication required.");
 return {url,key,user:d};
}
async function rest(url,key,token,path,method="GET",body){
 const r=await fetch(url+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",Prefer:"return=representation"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
 if(!r.ok)throw new Error(typeof data==="string"?data:(data?.message||data?.error||"Supabase request failed"));
 return data;
}
async function adminRest(url,service,path,method="GET",body){
 const r=await fetch(url+"/rest/v1/"+path,{method,headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=representation"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
 if(!r.ok)throw new Error(typeof data==="string"?data:(data?.message||data?.error||"Admin database request failed"));
 return data;
}
async function cancelStripe(subscriptionId){
 const key=process.env.STRIPE_SECRET_KEY||process.env.HUDHUD_STRIPE_SECRET_KEY;
 if(!key||!subscriptionId)return {canceled:false,reason:"not_configured"};
 const r=await fetch("https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(subscriptionId),{method:"DELETE",headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64")}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d?.error?.message||"Stripe subscription cancellation failed.");
 return {canceled:true,status:d.status};
}
async function authAdmin(url,service,userId,method,body){
 const r=await fetch(url+"/auth/v1/admin/users/"+encodeURIComponent(userId),{method,headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d?.msg||d?.message||d?.error_description||"Supabase Auth admin request failed.");
 return d;
}
export default async function handler(req,res){
 try{
  const token=bearer(req);if(!token)throw new Error("Authentication required.");
  const {url,key,user}=await supaUser(token);
  if(req.method==="GET"){
   const life=(await rest(url,key,token,"hudhud_account_lifecycle?select=status,suspended_at,updated_at&user_id=eq."+encodeURIComponent(user.id)+"&limit=1", "GET"))?.[0]||{status:"active"};
   const billing=(await rest(url,key,token,"hudhud_billing?select=plan,status,current_period_end&user_id=eq."+encodeURIComponent(user.id)+"&limit=1","GET"))?.[0]||{};
   const con=(await rest(url,key,token,"hudhud_connections?select=id&user_id=eq."+encodeURIComponent(user.id),"GET"))||[];
   return res.status(200).json({status:life.status||"active",plan:billing.plan||"Free",billingStatus:billing.status||"No active subscription",connectionCount:con.length});
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const action=req.body?.action;
  if(action!=="suspend"&&action!=="delete")return res.status(400).json({error:"Unsupported account action."});
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;
  if(!service)throw new Error("Server account-management key is not configured.");
  const billing=(await adminRest(url,service,"hudhud_billing?select=stripe_subscription_id,status&user_id=eq."+encodeURIComponent(user.id)+"&limit=1"))?.[0];
  if(billing?.stripe_subscription_id)await cancelStripe(billing.stripe_subscription_id);
  await adminRest(url,service,"hudhud_account_lifecycle?user_id=eq."+encodeURIComponent(user.id),"PATCH",{status:action==="suspend"?"suspended":"deletion_pending",suspended_at:action==="suspend"?new Date().toISOString():null,updated_at:new Date().toISOString()});
  await adminRest(url,service,"hudhud_billing?user_id=eq."+encodeURIComponent(user.id),"PATCH",{status:"canceled",updated_at:new Date().toISOString()});
  if(action==="suspend"){
    await authAdmin(url,service,user.id,"PUT",{user_metadata:{...(user.user_metadata||{}),hudhud_account_status:"suspended"}});
    return res.status(200).json({ok:true,status:"suspended"});
  }
  await adminRest(url,service,"hudhud_oauth_tokens?user_id=eq."+encodeURIComponent(user.id),"DELETE");
  await adminRest(url,service,"hudhud_provider_accounts?user_id=eq."+encodeURIComponent(user.id),"DELETE");
  await adminRest(url,service,"hudhud_integrations?user_id=eq."+encodeURIComponent(user.id),"DELETE");
  await adminRest(url,service,"hudhud_social_accounts?user_id=eq."+encodeURIComponent(user.id),"DELETE");
  await adminRest(url,service,"hudhud_connections?user_id=eq."+encodeURIComponent(user.id),"DELETE");
  await authAdmin(url,service,user.id,"DELETE");
  return res.status(200).json({ok:true,status:"deleted"});
}