function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
async function userFromRequest(req){
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
 const b=base(),key=process.env.HUDHUD_SUPABASE_KEY;
 if(!token||!b||!key)throw new Error("Authentication required.");
 const r=await fetch(b+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
 if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
 return r.json();
}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 try{
  await userFromRequest(req);
  const sid=String(process.env.TWILIO_ACCOUNT_SID||"").trim();
  const token=String(process.env.TWILIO_AUTH_TOKEN||"").trim();
  const from=String(process.env.TWILIO_FROM_NUMBER||"").trim();
  const to="7146966259";
  if(!sid||!token||!from)return res.status(503).json({error:"SMS is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to the server environment."});
  const body=new URLSearchParams({
   To:"+1"+to,
   From:from,
   Body:"HudHud SMS test: your SMS connector is working. — HudHud"
  });
  const auth=Buffer.from(sid+":"+token).toString("base64");
  const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{method:"POST",headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!r.ok)return res.status(502).json({error:data?.message||"Twilio rejected the SMS request."});
  return res.status(200).json({ok:true,status:data.status||"queued"});
 }catch(e){
  const msg=e.message||"SMS test failed.";
  return res.status(/Authentication/.test(msg)?401:500).json({error:msg});
 }
}
