// HudHud purchase approval gateway. This endpoint NEVER charges a payment method.
// External merchant settlement requires an approved Stripe agent-wallet integration.
const BASE=()=>String(process.env.HUDHUD_SUPABASE_URL||"").replace(/\/$/,"");
const KEY=()=>process.env.HUDHUD_SUPABASE_KEY||"";
async function user(req){
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
 if(!token||!BASE()||!KEY())return null;
 const r=await fetch(BASE()+"/auth/v1/user",{headers:{apikey:KEY(),Authorization:"Bearer "+token}});
 if(!r.ok)return null;return r.json();
}
async function db(path,method,body){
 const r=await fetch(BASE()+"/rest/v1/"+path,{method,headers:{apikey:KEY(),Authorization:"Bearer "+KEY(),"Content-Type":"application/json",Prefer:"return=representation"},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw new Error("Purchase storage is not configured. Apply docs/hudhud-purchases.sql.");
 return data;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Method not allowed"});
 const account=await user(req);
 if(!account?.id)return res.status(401).json({error:"Sign in required"});
 try{
  if(req.method==="GET"){
   const rows=await db("hudhud_purchase_requests?user_id=eq."+encodeURIComponent(account.id)+"&select=id,merchant,item,amount_cents,currency,status,checkout_url,created_at,approved_at&order=created_at.desc&limit=50","GET");
   return res.status(200).json({requests:rows});
  }
  const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  if(body.action==="request"){
   const amount=Number(body.amount_cents);
   if(!Number.isSafeInteger(amount)||amount<1||amount>500)return res.status(400).json({error:"Per-purchase limit is $5.00"});
   const merchant=String(body.merchant||"").trim().slice(0,120);
   const item=String(body.item||"").trim().slice(0,240);
   if(!merchant||!item)return res.status(400).json({error:"Merchant and item required"});
   let checkout=null;
   if(body.checkout_url){
    const url=new URL(String(body.checkout_url));
    if(url.protocol!=="https:"||url.username||url.password||!url.hostname.includes("."))return res.status(400).json({error:"Secure checkout URL required"});
    checkout=url.toString();
   }
   const rows=await db("hudhud_purchase_requests","POST",{user_id:account.id,merchant,item,amount_cents:amount,currency:"usd",checkout_url:checkout,status:"pending"});
   return res.status(201).json({request:rows[0],payment_executed:false});
  }
  if(body.action==="approve"||body.action==="reject"){
   const id=String(body.id||"");
   if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:"Valid request ID required"});
   const rows=await db("hudhud_purchase_requests?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(account.id)+"&status=eq.pending","PATCH",{status:body.action==="approve"?"approved":"rejected",...(body.action==="approve"?{approved_at:new Date().toISOString()}:{})});
   if(!rows?.length)return res.status(404).json({error:"Pending purchase request not found"});
   return res.status(200).json({request:rows[0],payment_executed:false,message:"Approval recorded. External checkout must still be completed through the merchant's secure payment flow."});
  }
  return res.status(400).json({error:"Unknown action"});
 }catch(e){return res.status(503).json({error:e.message||"Purchase gateway unavailable"});}
}
