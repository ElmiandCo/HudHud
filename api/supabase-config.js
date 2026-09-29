export default async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed."});
  }

  const url=String(process.env.HUDHUD_SUPABASE_URL||process.env.SUPABASE_URL||"")
    .trim()
    .replace(/\/+$/,"")
    .replace(/\/(?:rest\/v1|auth\/v1)$/i,"");

  const rawKey=process.env.HUDHUD_SUPABASE_KEY||
    process.env.SUPABASE_ANON_KEY||
    process.env.SUPABASE_PUBLISHABLE_KEY||"";

  const key=String(rawKey).trim()
    .replace(/^[\"']|[\"']$/g,"")
    .replace(/[\s\u0000-\u001F\u007F]/g,"");

  if(!url||!key){
    return res.status(503).json({error:"Supabase is not configured."});
  }

  if(/^sb_secret_/i.test(key)||/^service_role/i.test(key)){
    return res.status(503).json({
      error:"HUDHUD_SUPABASE_KEY is a server-only key. Configure the Supabase publishable/anon key for browser authentication."
    });
  }

  return res.status(200).json({url,key});
}
