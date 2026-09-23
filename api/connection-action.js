import { checkConnection } from "./connection-status.js";

export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed."});
  }
  const name=String(req.body?.connection||"").toLowerCase();
  if(!["github","vercel","supabase"].includes(name)){
    return res.status(400).json({error:"Unknown connection. Use github, vercel, or supabase."});
  }
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    last=await checkConnection(name);
    if(last.status==="connected") break;
    if(attempt<3) await new Promise(r=>setTimeout(r,400*attempt));
  }
  return res.status(200).json({connection:name,attempts:3,result:last,attemptedAt:new Date().toISOString()});
}