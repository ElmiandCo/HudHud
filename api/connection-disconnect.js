function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();}
async function user(req){
 const token=bearer(req),url=process.env.HUDHUD_SUPABASE_URL,key=process.env.HUDHUD_SUPABASE_KEY;
 if(!token||!url||!key)throw new Error("Authentication required.");
 const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}}),d=await r.json().catch(()=>({}));
 if(!r.ok||!d?.id)throw new Error("Authentication required.");
 return {token,url,key,id:d.id};
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  const {token,url,key,id}=await user(req);
  const requested=Array.isArray(req.body?.providers)?req.body.providers.map(x=>String(x).toLowerCase()):[];
  if(!requested.length)return res.status(400).json({error:"No providers selected."});
  const qs="user_id=eq."+encodeURIComponent(id)+"&provider=in.("+requested.map(x=>encodeURIComponent(x)).join(",")+")";
  for(const path of ["hudhud_oauth_tokens","hudhud_provider_accounts","hudhud_social_accounts"]){
    await fetch(url+"/rest/v1/"+path+"?"+qs,{method:"DELETE",headers:{apikey:key,Authorization:"Bearer "+token}});
  }
  await fetch(url+"/rest/v1/hudhud_integrations?"+qs,{method:"PATCH",headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({status:"disconnected",disconnected_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  await fetch(url+"/rest/v1/hudhud_connections?"+qs,{method:"DELETE",headers:{apikey:key,Authorization:"Bearer "+token}});
  return res.status(200).json({ok:true,disconnected:requested});
 }catch(e){return res.status(401).json({error:e.message||"Disconnect failed."});}
}