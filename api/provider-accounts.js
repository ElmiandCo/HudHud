function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
async function userFromRequest(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  const url=base(),key=process.env.HUDHUD_SUPABASE_KEY;
  if(!url||!key||!token)throw new Error("Authentication required.");
  const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
function adminHeaders(){
  const key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error("Provider account storage is not configured. Add HUDHUD_SUPABASE_SERVICE_ROLE_KEY.");
  return {apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
}
export default async function handler(req,res){
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