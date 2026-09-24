function base(){return String(process.env.HUDHUD_SUPABASE_URL||"").trim().replace(/\/+$/,"");}
function serviceKey(){return process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY||"";}
async function db(path,options={}){
 const key=serviceKey();if(!base()||!key)throw new Error("Newsletter server storage is not configured.");
 const r=await fetch(base()+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||text||"Database request failed.");return data;
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function emailHtml(news){const sections=Array.isArray(news.content?.sections)?news.content.sections:[];return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#24202a;padding:24px">'+sections.map(s=>'<section style="margin:0 0 28px">'+(s.image?'<img src="'+esc(s.image)+'" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px" alt="">':"")+'<h2>'+esc(s.heading||"")+'</h2><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">'+esc(s.text||"")+'</p></section>').join("")+'</div>';}
async function sendNewsletter(news){
 const resend=process.env.RESEND_API_KEY||"";const from=process.env.HUDHUD_EMAIL_FROM||process.env.RESEND_FROM||"";
 if(!resend||!from)throw new Error("Email sending is not configured.");
 const joins=await db("hudhud_newsletter_recipients?select=contact_id&newsletter_id=eq."+encodeURIComponent(news.id));
 const ids=(joins||[]).map(x=>x.contact_id);if(!ids.length)throw new Error("No recipients.");
 const contacts=await db("hudhud_newsletter_contacts?select=email,name&id=in.("+ids.join(",")+")");
 const emails=(contacts||[]).filter(x=>x.email).map(x=>({from,to:[x.email],subject:news.subject,html:emailHtml(news),tags:[{name:"hudhud_newsletter",value:String(news.id)}]}));
 let total=0;
 for(let i=0;i<emails.length;i+=100){const batch=emails.slice(i,i+100);const r=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"hudhud-cron/"+news.id+"/"+news.next_send_at+"/"+i},body:JSON.stringify(batch)});const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}if(!r.ok)throw new Error(d?.message||"Resend send failed.");total+=batch.length;}
 return total;
}
function nextAfter(iso,frequency){const d=new Date(iso);if(frequency==="daily")d.setUTCDate(d.getUTCDate()+1);else if(frequency==="weekly")d.setUTCDate(d.getUTCDate()+7);else if(frequency==="monthly")d.setUTCMonth(d.getUTCMonth()+1);else return null;return d.toISOString();}
export default async function handler(req,res){
 const secret=process.env.CRON_SECRET||"";const auth=String(req.headers.authorization||"");if(secret&&auth!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized."});
 if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 try{
  const due=await db("hudhud_newsletters?select=*&status=eq.scheduled&next_send_at=lte."+encodeURIComponent(new Date().toISOString())+"&order=next_send_at.asc&limit=20");
  const results=[];
  for(const news of due||[]){
   try{
    const count=await sendNewsletter(news);
    const sentAt=new Date().toISOString();
    await db("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,sent_at:sentAt,status:"sent",recipient_count:count})});
    const next=nextAfter(news.next_send_at,news.frequency);
    const end=next&&news.end_date?new Date(next)>new Date(news.end_date+"T23:59:59Z"):false;
    await db("hudhud_newsletters?id=eq."+encodeURIComponent(news.id),{method:"PATCH",body:JSON.stringify({status:next&&!end?"scheduled":"completed",next_send_at:next&&!end?next:null,updated_at:sentAt})});
    results.push({id:news.id,status:"sent",recipientCount:count,nextSend:next&&!end?next:null});
   }catch(e){
    await db("hudhud_newsletter_sends",{method:"POST",body:JSON.stringify({newsletter_id:news.id,scheduled_for:news.next_send_at,status:"failed",recipient_count:0,error_message:e.message||"Send failed"})}).catch(()=>{});
    results.push({id:news.id,status:"failed",error:e.message||"Send failed"});
   }
  }
  return res.status(200).json({ok:true,checkedAt:new Date().toISOString(),processed:results});
 }catch(e){return res.status(503).json({error:e.message||"Newsletter cron failed."});}
}