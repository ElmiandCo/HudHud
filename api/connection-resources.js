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
  const auth=String(req.headers.authorization||"");
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!base||!key||!token)throw new Error("Authentication required.");
  const r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:`Bearer ${token}`}});
  if(!r.ok)throw new Error("Authentication expired. Please sign in again.");
  return r.json();
}
async function githubResources(){
  if(!env("HUDHUD_GITHUB_TOKEN"))throw new Error("GitHub connection is not configured.");
  const owner=env("HUDHUD_GITHUB_OWNER")||"ElmiandCo";
  const repo=env("HUDHUD_GITHUB_REPO")||"HudHud";
  const data=await jsonFetch("https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&sort=updated",{headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Authorization":`Bearer ${env("HUDHUD_GITHUB_TOKEN")}`}});
  const repos=(Array.isArray(data)?data:[]).map(r=>({id:String(r.id),name:r.name,full_name:r.full_name,private:!!r.private,default_branch:r.default_branch||"main,description":r.description||"",html_url:r.html_url||"",permissions:r.permissions||{}}));
  const ensured=repos.some(r=>r.full_name===owner+"/"+repo)?repos:repos.concat([{id:"configured",name:repo,full_name:owner+"/"+repo,private:false,default_branch:"main",description:"Configured HudHud repository",html_url:`https://github.com/${owner}/${repo}`,permissions:{}}]);
  return {provider:"github",resources:ensured};
}
async function vercelResources(){
  if(!env("HUDHUD_VERCEL_TOKEN"))throw new Error("Vercel connection is not configured.");
  const url=new URL("https://api.vercel.com/v9/projects");
  if(env("HUDHUD_VERCEL_TEAM_ID"))url.searchParams.set("teamId",env("HUDHUD_VERCEL_TEAM_ID"));
  url.searchParams.set("limit","100");
  const data=await jsonFetch(url.toString(),{headers:{Authorization:`Bearer ${env("HUDHUD_VERCEL_TOKEN")}`}});
  return {provider:"vercel",resources:(data.projects||[]).map(p=>({id:p.id||p.projectId,name:p.name,framework:p.framework||"",link:p.link||null,latestDeployments:p.latestDeployments||[],targets:p.targets||{},nodeVersion:p.nodeVersion||null}))};
}
async function supabaseResources(){
  const base=cleanBase(env("HUDHUD_SUPABASE_URL")),key=env("HUDHUD_SUPABASE_KEY");
  if(!base||!key)throw new Error("Supabase connection is not configured.");
  const data=await jsonFetch(base+"/rest/v1/",{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  const paths=data.paths||{};
  const resources=Object.keys(paths).filter(p=>p.startsWith("/")&&!p.startsWith("/rpc/")).map(p=>p.slice(1)).filter(Boolean).map(name=>({id:name,name,type:"table"}));
  return {provider:"supabase",resources};
}
export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed."});}
  try{
    await requireUser(req);
    const provider=String(req.query?.provider||"").toLowerCase();
    if(!["github","vercel","supabase"].includes(provider))return res.status(400).json({error:"Unknown connection provider."});
    const data=provider==="github"?await githubResources():provider==="vercel"?await vercelResources():await supabaseResources();
    return res.status(200).json(data);
  }catch(error){
    const message=error?.message||"Connection resources unavailable.";
    const status=/authentication/i.test(message)?401:503;
    return res.status(status).json({error:message});
  }
}
