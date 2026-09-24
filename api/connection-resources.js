function cleanBase(value){return String(value||"").trim().replace(/\/+$/,"").replace(/\/(?:rest\/v1|auth\/v1)$/i,"");}
async function jsonFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const text=await r.text();let data={};try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);
  return data;
}
function env(name){return process.env[name]||"";}
async function requireUser(req){
  const base=cleanBase(env("HUDHUD_SUPABASE_URL")),key=env("HUDHUD_SUPABASE_KEY");
  // Management OAuth accounts are used for account-level discovery; the configured project remains the default REST resource source.
  const auth=String(req.headers.authorization||"");
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!base||!key||!token)throw new Error("Authentication required.");
  const r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:`Bearer ${token}`}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
async function providerAccount(req,provider){
  const id=String(req.query?.account_id||"");
  if(!id)return null;
  const service=env("HUDHUD_SUPABASE_SERVICE_ROLE_KEY");
  if(!service)throw new Error("Provider account storage is not configured.");
  const url=cleanBase(env("HUDHUD_SUPABASE_URL"));
  const auth=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"").trim();
  if(!auth)throw new Error("Authentication required.");
  const u=await fetch(url+"/auth/v1/user",{headers:{apikey:env("HUDHUD_SUPABASE_KEY"),Authorization:"Bearer "+auth}});
  if(!u.ok)throw new Error("Authentication expired. Please sign in again.");
  const user=await u.json();
  const r=await fetch(url+"/rest/v1/hudhud_provider_accounts?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&select=provider,access_token,account_name,account_email,provider_account_id",{headers:{apikey:service,Authorization:"Bearer "+service}});
  const rows=await r.json();
  if(!r.ok||!rows[0])throw new Error("Connected provider account not found.");
  if(rows[0].provider!==provider||!rows[0].access_token)throw new Error("Connected provider account is unavailable.");
  return rows[0];
}
async function githubResources(account){
  if(!account&&!env("HUDHUD_GITHUB_TOKEN"))throw new Error("GitHub connection is not configured.");
  const owner=env("HUDHUD_GITHUB_OWNER")||"ElmiandCo";
  const repo=env("HUDHUD_GITHUB_REPO")||"HudHud";
  const token=account?.access_token||env("HUDHUD_GITHUB_TOKEN");
  const data=await jsonFetch("https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&sort=updated",{headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Authorization":`Bearer ${token}`}});
  const repos=(Array.isArray(data)?data:[]).map(r=>({id:String(r.id),name:r.name,full_name:r.full_name,private:!!r.private,default_branch:r.default_branch||"main",description:r.description||"",html_url:r.html_url||"",permissions:r.permissions||{}}));
  const ensured=repos.some(r=>r.full_name===owner+"/"+repo)?repos:repos.concat([{id:"configured",name:repo,full_name:owner+"/"+repo,private:false,default_branch:"main",description:"Configured HudHud repository",html_url:`https://github.com/${owner}/${repo}`,permissions:{}}]);
  return {provider:"github",resources:ensured};
}
async function vercelResources(account){
  if(!account&&!env("HUDHUD_VERCEL_TOKEN"))throw new Error("Vercel connection is not configured.");
  const url=new URL("https://api.vercel.com/v9/projects");
  if(env("HUDHUD_VERCEL_TEAM_ID"))url.searchParams.set("teamId",env("HUDHUD_VERCEL_TEAM_ID"));
  url.searchParams.set("limit","100");
  const data=await jsonFetch(url.toString(),{headers:{Authorization:`Bearer ${account?.access_token||env("HUDHUD_VERCEL_TOKEN")}`}});
  return {provider:"vercel",resources:(data.projects||[]).map(p=>({id:p.id||p.projectId,name:p.name,framework:p.framework||"",link:p.link||null,latestDeployments:p.latestDeployments||[],targets:p.targets||{},nodeVersion:p.nodeVersion||null}))};
}
async function supabaseResources(account){
  const base=cleanBase(env("HUDHUD_SUPABASE_URL")),key=env("HUDHUD_SUPABASE_KEY");
  if(!base||!key)throw new Error("Supabase connection is not configured.");
  const headers={apikey:key,Authorization:"Bearer "+key};
  let resources=[];
  try{
    const data=await jsonFetch(base+"/rest/v1/",{headers});
    const paths=data.paths||{};
    resources=Object.keys(paths).filter(p=>p.startsWith("/")&&!p.startsWith("/rpc/")).map(p=>p.slice(1)).filter(Boolean).map(name=>({id:name,name,type:"table"}));
  }catch{}
  if(!resources.length){
    const known=["hudhud_projects","hudhud_opportunities","hudhud_connections","hudhud_activity","hudhud_project_connections"];
    const checks=await Promise.all(known.map(async name=>{
      try{
        const data=await jsonFetch(base+"/rest/v1/"+encodeURIComponent(name)+"?select=*&limit=1",{headers});
        return data?{id:name,name,type:"table"}:null;
      }catch{return null;}
    }));
    resources=checks.filter(Boolean);
  }
  const match=base.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return {provider:"supabase",project:{ref:match?match[1]:"",url:base},resources};
}
export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    await requireUser(req);
    const provider=String(req.query?.provider||"").toLowerCase();
    if(!["github","vercel","supabase"].includes(provider))return res.status(400).json({error:"Unknown connection provider."});
    const account=await providerAccount(req,provider);
    const data=provider==="github"?await githubResources(account):provider==="vercel"?await vercelResources(account):await supabaseResources(account);
    if(account)data.account={id:String(req.query.account_id),name:account.account_name,email:account.account_email||"",provider_account_id:account.provider_account_id};
    return res.status(200).json(data);
  }catch(error){
    const message=error?.message||"Connection resources unavailable.";
    const status=/authentication/i.test(message)?401:503;
    return res.status(status).json({error:message});
  }
}
