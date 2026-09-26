import { clearStateCookie, readStateCookie, exchangeCode, fetchProfile, saveOAuthConnection, callbackRedirect } from "../lib/social-oauth.js";

export default async function handler(req,res){
  if(req.method !== "GET"){res.setHeader("Allow","GET");return res.status(405).send("Method not allowed.");}
  try{
    const provider="tiktok",state=readStateCookie(req);
    if(state.provider!==provider)throw new Error("OAuth provider state mismatch.");
    if(String(req.query?.state||"")!==state.state)throw new Error("OAuth state mismatch.");
    if(req.query?.error)throw new Error(String(req.query.error_description||req.query.error));
    const code=String(req.query?.code||"");
    if(!code)throw new Error("Provider did not return an authorization code.");
    const token=await exchangeCode(req,provider,code,state);
    const profile=await fetchProfile(provider,token.access_token);
    const account=await saveOAuthConnection(state.user_id,provider,token,profile,req);
    clearStateCookie(res);
    return res.redirect(302,callbackRedirect(req,provider,"connected",account.accountHandle ? "Connected @"+account.accountHandle : "Connected"));
  }catch(e){
    const safeMessage = String(e?.message || "TikTok connection failed.").replace(/[\r\n]+/g, " ").slice(0, 300);
    console.error("[TikTok OAuth] callback failed:", safeMessage);
    clearStateCookie(res);
    return res.redirect(302,callbackRedirect(req,"tiktok","error",safeMessage));
  }
}
