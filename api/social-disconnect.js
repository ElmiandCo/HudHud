import { getAuthenticatedUser } from "../lib/hudhud-context.js";

function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();}
function admin(){
  const url=String(process.env.HUDHUD_SUPABASE_URL||"").replace(/\/$/,"");
  const key=String(process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"");
  if(!url||!key)throw new Error("Supabase server credentials are not configured.");
  return {url,key,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"}};
}
export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await getAuthenticatedUser(bearer(req));
    const provider=String(req.body?.provider||req.query?.provider||"").toLowerCase();
    if(!["instagram","x","tiktok","linkedin"].includes(provider))return res.status(400).json({error:"Unsupported social provider."});
    const {url,key,headers}=admin();
    const base=url+"/rest/v1";
    const filter="user_id=eq."+encodeURIComponent(user.id)+"&provider=eq."+encodeURIComponent(provider);
    const tokenDelete=await fetch(base+"/hudhud_oauth_tokens?"+filter,{method:"DELETE",headers});
    if(!tokenDelete.ok)throw new Error("Could not remove stored OAuth credentials.");
    const integrationUpdate=await fetch(base+"/hudhud_integrations?"+filter,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"disconnected",disconnected_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()})});
    if(!integrationUpdate.ok)throw new Error("Could not update integration status.");
    return res.status(200).json({ok:true});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not disconnect social provider."});}
}
