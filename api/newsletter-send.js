function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function serviceKey(){return process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"";}
async function userFromRequest(req){
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
 const b=base(),key=process.env.HUDHUD_SUPABASE_KEY;
 if(!token||!b||!key)throw new Error("Authentication required.");
 const r=await fetch(b+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
 if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
 return r.json();
}
async function db(path,options={}){
 const key=serviceKey();if(!base()||!key)throw new Error("Newsletter server storage is not configured.");
 const r=await fetch(base()+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||text||"Database request failed.");
 return data;
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function emailHtml(news){
 const sections=Array.isArray(news.content?.sections)?news.content.sections:[];
 return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a;padding:24px">'+sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+esc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+esc(s.heading||"")+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+esc(s.text||"")+'</p></section>').join("")+'</div>';
}
async function sendNewsletter(news){
 const resend=process.env.RESEND_API_KEY||"";const from=process.env.HUDHUD_EMAIL_FROM||process.env.RESEND_FROM||"";
 if(!resend||!from)throw new Error("Email sending is not configured. Add RESEND_API_KEY and HUDHUD_EMAIL_FROM to the server.");
 const joins=await db("hudhud_newsletter_recipients?select=contact_id&newsletter_id=eq."+encodeURIComponent(news.id));
 const ids=(joins||[]).map(x=>x.contact_id);
 if(!ids.length)throw new Error("This newsletter has no recipients.");
 const contacts=await db("hudhud_newsletter_contacts?select=email,name&id=in.("+ids.join(",")+")");
 const emails=(contacts||[]).filter(x=>x.email).map(x=>({from,to:[x.email],subject:news.subject,html:emailHtml(news),tags:[{name:"hudhud_newsletter",value:String(news.id)}]}));
 if(!emails.length)throw new Error("No valid recipient emails were found.");
 let total=0;
 for(let i=0;i<emails.length;i+=100){
   const batch=emails.slice(i,i+100);
   const r=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"hudhud-newsletter/"+news.id+"/"+Date.now()+"/"+i},body:JSON.stringify(batch)});
   const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
   if(!r.ok)throw new Error(data?.message||"Resend batch send failed.");
   total+=batch.length;
 }
 return total;
}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 try{
  const user=await userFromRequest(req);
  const newsletterId=String(req.body?.newsletterId||"");
  if(!newsletterId)return res.status(400).json({error:"newsletterId is required."});
  const rows=await db("hudhud_newsletters?select=*&id=eq."+encodeURIComponent(newsletterId)+"&user_id=eq."+encodeURIComponent(user.id));
  const news=rows?.[0];if(!news)return res.status(404).json({error:"Newsletter not found."});
  const count=await sendNewsletter(news);
  await db("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:new Date().toISOString(),sent_at:new Date().toISOString(),status:"sent",recipient_count:count})});
  return res.status(200).json({ok:true,recipientCount:count});
 }catch(e){return res.status(/Authentication/.test(e.message)?401:503).json({error:e.message||"Newsletter send failed."});}
}