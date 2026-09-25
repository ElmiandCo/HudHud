import { getAuthenticatedUser } from "../lib/hudhud-context.js";

function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();}
function admin(){
  const url=String(process.env.HUDHUD_SUPABASE_URL||"").replace(/\/$/,"");
  const key=String(process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"");
  if(!url||!key)throw new Error("Supabase server credentials are not configured.");
  return {url,key,headers:{apikey:key,Authorization:"Bearer "+key}};
}
export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    const user=await getAuthenticatedUser(bearer(req));
    const {url,key,headers}=admin();
    const r=await fetch(url+"/rest/v1/hudhud_integrations?select=id,provider,category,status,provider_account_id,display_name,account_handle,scopes,capabilities,metadata,connected_at,last_synced_at,expires_at,last_error&user_id=eq."+encodeURIComponent(user.id)+"&category=eq.social&order=updated_at.desc",{headers});
    const data=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error(data.message||"Could not load social integrations.");
    return res.status(200).json({integrations:data});
  }catch(e){return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not load social integrations."});}
}
