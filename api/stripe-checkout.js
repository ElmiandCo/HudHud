function normalizeBase(value){return String(value||"").trim().replace(/\/+$/,"");}
async function hudhudUser(req){
 const auth=String(req.headers.authorization||"");
 if(!auth.startsWith("Bearer "))return null;
 const base=normalizeBase(process.env.HUDHUD_SUPABASE_URL);
 const key=process.env.HUDHUD_SUPABASE_KEY;
 if(!base||!key)return null;
 const r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:auth}});
 if(!r.ok)return null;
 return await r.json();
}
function stripeKey(){return process.env.STRIPE_SECRET_KEY||process.env.HUDHUD_STRIPE_SECRET_KEY||"";}
function priceFor(plan){
 const map={pro:process.env.HUDHUD_STRIPE_PRO_PRICE_ID||"price_1UJ1tnKDZ06Dc8d4dhUyrkDC",premium:process.env.HUDHUD_STRIPE_PREMIUM_PRICE_ID,test:process.env.HUDHUD_STRIPE_TEST_PRICE_ID,pro_lifetime:process.env.HUDHUD_STRIPE_PRO_LIFETIME_PRICE_ID,premium_lifetime:process.env.HUDHUD_STRIPE_PREMIUM_LIFETIME_PRICE_ID};
 return map[plan]||"";
}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 const user=await hudhudUser(req);
 if(!user?.id)return res.status(401).json({error:"Sign in required."});
 const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
 const plan=String(body.plan||"").toLowerCase();
 if(!["pro","premium","test","pro_lifetime","premium_lifetime"].includes(plan))return res.status(400).json({error:"Invalid plan."});
 const secret=stripeKey(),price=priceFor(plan);
 if(!secret)return res.status(503).json({error:"Stripe is not configured on the server."});
 if(!price)return res.status(503).json({error:"This plan's Stripe Price ID is not configured yet."});
 const origin=normalizeBase(process.env.HUDHUD_PUBLIC_URL)||("https://"+req.headers.host);
 const params=new URLSearchParams();
 params.set("mode",plan==="test"||plan.endsWith("_lifetime")?"payment":"subscription");
 params.set("line_items[0][price]",price);
 params.set("line_items[0][quantity]","1");
 params.set("success_url",origin+"/?billing=success&plan="+encodeURIComponent(plan)+"&session_id={CHECKOUT_SESSION_ID}");
 params.set("cancel_url",origin+"/?billing=cancelled");
 params.set("customer_email",String(user.email||""));
 params.set("client_reference_id",String(user.id));
 params.set("metadata[hudhud_user_id]",String(user.id));
 params.set("metadata[hudhud_plan]",plan);
 if(plan!=="test"&&!plan.endsWith("_lifetime")){
   params.set("subscription_data[metadata][hudhud_user_id]",String(user.id));
   params.set("subscription_data[metadata][hudhud_plan]",plan);
 }
 const r=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body:params});
 const data=await r.json();
 if(!r.ok)return res.status(r.status).json({error:data.error?.message||"Stripe Checkout could not be created."});
 return res.status(200).json({url:data.url,id:data.id,plan});
}
