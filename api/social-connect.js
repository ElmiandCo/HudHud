import { getAuthenticatedUser } from "../lib/hudhud-context.js";
import { buildAuthorizeUrl, setStateCookie } from "../lib/social-oauth.js";

function bearer(req){ return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim(); }

export default async function handler(req,res){
  if(req.method !== "GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed."});
  }
  try{
    const provider=String(req.query?.provider||"").toLowerCase();
    const token=bearer(req);
    const user=await getAuthenticatedUser(token);
    const {url,statePayload}=buildAuthorizeUrl(req,provider,user.id);
    setStateCookie(res,statePayload);
    return res.status(200).json({url,provider});
  }catch(e){
    return res.status(/Authentication/i.test(e.message)?401:503).json({error:e.message||"Could not start social authorization."});
  }
}
