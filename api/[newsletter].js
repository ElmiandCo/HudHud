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
async function sendHandler(req,res){
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

function cronBase(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function cronServiceKey(){return process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"";}
async function cronDb(path,options={}){
 const key=cronServiceKey();if(!cronBase()||!key)throw new Error("Newsletter server storage is not configured.");
 const r=await fetch(cronBase()+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||text||"Database request failed.");return data;
}
function cronEsc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function cronEmailHtml(news){const sections=Array.isArray(news.content?.sections)?news.content.sections:[];return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a;padding:24px">'+sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+cronEsc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+cronEsc(s.heading||"")+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+cronEsc(s.text||"")+'</p></section>').join("")+'</div>';}
async function cronSendNewsletter(news){
 const resend=process.env.RESEND_API_KEY||"";const from=process.env.HUDHUD_EMAIL_FROM||process.env.RESEND_FROM||"";
 if(!resend||!from)throw new Error("Email sending is not configured.");
 const joins=await cronDb("hudhud_newsletter_recipients?select=contact_id&newsletter_id=eq."+encodeURIComponent(news.id));
 const ids=(joins||[]).map(x=>x.contact_id);if(!ids.length)throw new Error("No recipients.");
 const contacts=await cronDb("hudhud_newsletter_contacts?select=email,name&id=in.("+ids.join(",")+")");
 const emails=(contacts||[]).filter(x=>x.email).map(x=>({from,to:[x.email],subject:news.subject,html:cronEmailHtml(news),tags:[{name:"hudhud_newsletter",value:String(news.id)}]}));
 let total=0;
 for(let i=0;i<emails.length;i+=100){const batch=emails.slice(i,i+100);const r=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"hudhud-cron/"+news.id+"/"+news.next_send_at+"/"+i},body:JSON.stringify(batch)});const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}if(!r.ok)throw new Error(d?.message||"Resend send failed.");total+=batch.length;}
 return total;
}
function cronNextAfter(iso,frequency){const d=new Date(iso);if(frequency==="daily")d.setUTCDate(d.getUTCDate()+1);else if(frequency==="weekly")d.setUTCDate(d.getUTCDate()+7);else if(frequency==="monthly")d.setUTCMonth(d.getUTCMonth()+1);else return null;return d.toISOString();}
async function cronHandler(req,res){
 const secret=process.env.CRON_SECRET||"";const auth=String(req.headers.authorization||"");if(secret&&auth!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized."});
 if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 try{
  const due=await cronDb("hudhud_newsletters?select=*&status=eq.scheduled&next_send_at=lte."+encodeURIComponent(new Date().toISOString())+"&order=next_send_at.asc&limit=20");
  const results=[];
  for(const news of due||[]){
   try{
    const count=await cronSendNewsletter(news);
    const sentAt=new Date().toISOString();
    await cronDb("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,sent_at:sentAt,status:"sent",recipient_count:count})});
    const next=cronNextAfter(news.next_send_at,news.frequency);
    const end=next&&news.end_date?new Date(next)>new Date(news.end_date+"T23:59:59Z"):false;
    await cronDb("hudhud_newsletters?id=eq."+encodeURIComponent(news.id),{method:"PATCH",body:JSON.stringify({status:next&&!end?"scheduled":"completed",next_send_at:next&&!end?next:null,updated_at:sentAt})});
    results.push({id:news.id,status:"sent",recipientCount:count,nextSend:next&&!end?next:null});
   }catch(e){
    await cronDb("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,status:"failed",recipient_count:0,error_message:e.message||"Send failed"})}).catch(()=>{});
    results.push({id:news.id,status:"failed",error:e.message||"Send failed"});
   }
  }
  return res.status(200).json({ok:true,checkedAt:new Date().toISOString(),processed:results});
 }catch(e){return res.status(503).json({error:e.message||"Newsletter cron failed."});}
}


function newsletterRoute(req){
  const q=String(req.query?.newsletter||"").toLowerCase();
  if(q) return q;
  const path=String(req.url||"").split("?")[0].replace(/\/+$/,"");
  return path.split("/").pop().toLowerCase();
}
export default async function handler(req,res){
  const route=newsletterRoute(req);
  if(route==="newsletter-send") return sendHandler(req,res);
  if(route==="newsletter-cron") return cronHandler(req,res);
  return res.status(404).json({error:"Unknown newsletter endpoint."});
}
