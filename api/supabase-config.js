export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  const rawUrl=process.env.HUDHUD_SUPABASE_URL||"";
  const url=String(rawUrl).trim().replace(/\/+$/,"").replace(/\/(?:rest\/v1|auth\/v1)$/i,"");
  const key=process.env.HUDHUD_SUPABASE_KEY||"";
  if(!url||!key)return res.status(503).json({error:"Supabase is not configured."});
  if(key.startsWith("sb_secret_")||key.startsWith("service_role"))return res.status(503).json({error:"HUDHUD_SUPABASE_KEY is a server-only key. Add a Supabase publishable key for browser authentication."});
  return res.status(200).json({url,key});
}