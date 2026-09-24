import crypto from "node:crypto";
function normalizeBase(value){return String(value||"").trim().replace(/\/+$/,"");}
function stripeKey(){return process.env.STRIPE_SECRET_KEY||process.env.HUDHUD_STRIPE_SECRET_KEY||"";}
function verifySignature(payload,signature,secret){
 const parts=String(signature||"").split(",");let timestamp="",signatures=[];
 for(const part of parts){const [k,v]=part.split("=");if(k==="t")timestamp=v;if(k==="v1")signatures.push(v);}
 if(!timestamp||!signatures.length)return false;
 const age=Math.abs(Date.now()/1000-Number(timestamp));if(!Number.isFinite(age)||age>300)return false;
 const expected=crypto.createHmac("sha256",secret).update(timestamp+"."+payload).digest("hex");
 return signatures.some(sig=>sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)));
}
async function dbUpsert(row){
 const base=normalizeBase(process.env.HUDHUD_SUPABASE_URL),key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error("Supabase billing server configuration is missing.");
 const r=await fetch(base+"/rest/v1/hudhud_billing",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)});
 if(!r.ok)throw new Error(await r.text());
}
async function dbFindBySubscription(subscriptionId){
 const base=normalizeBase(process.env.HUDHUD_SUPABASE_URL),key=process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(base+"/rest/v1/hudhud_billing?stripe_subscription_id=eq."+encodeURIComponent(subscriptionId)+"&select=user_id",{headers:{apikey:key,Authorization:"Bearer "+key}});
 if(!r.ok)return null;const rows=await r.json();return rows[0]?.user_id||null;
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).end();
 const secret=stripeKey(),sig=req.headers["stripe-signature"],payload=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
 const webhookSecret=process.env.HUDHUD_STRIPE_WEBHOOK_SECRET;
 if(!secret||!webhookSecret)return res.status(503).json({error:"Stripe webhook is not configured."});
 if(!verifySignature(payload,sig,webhookSecret))return res.status(400).json({error:"Invalid Stripe signature."});
 const event=JSON.parse(payload),obj=event.data?.object||{};
 try{
  if(event.type==="checkout.session.completed"){
    const uid=obj.metadata?.hudhud_user_id||obj.client_reference_id;
    const plan=obj.metadata?.hudhud_plan||"free";
    if(uid)await dbUpsert({user_id:uid,stripe_customer_id:obj.customer||null,stripe_subscription_id:obj.subscription||null,plan,status:"active",updated_at:new Date().toISOString()});
  } else if(event.type==="customer.subscription.updated"||event.type==="customer.subscription.created"||event.type==="customer.subscription.deleted"){
    const uid=obj.metadata?.hudhud_user_id||await dbFindBySubscription(obj.id);
    if(uid){
      const plan=obj.metadata?.hudhud_plan||"pro";
      const active=["active","trialing","past_due"].includes(obj.status);
      await dbUpsert({user_id:uid,stripe_customer_id:obj.customer||null,stripe_subscription_id:obj.id,plan:active?plan:"free",status:obj.status,current_period_end:obj.current_period_end?new Date(obj.current_period_end*1000).toISOString():null,updated_at:new Date().toISOString()});
    }
  }
 }catch(e){return res.status(500).json({error:e.message||"Billing sync failed."});}
 return res.status(200).json({received:true});
}
