export default async function handler(req,res){
  if(req.method!=="GET" && req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed."});}
  const started=Date.now();
  const result={checkedAt:new Date().toISOString(),connections:{},latencyMs:null};
  const checks=[
    ["github",checkGitHub],
    ["vercel",checkVercel],
    ["supabase",checkSupabase]
  ];
  await Promise.all(checks.map(async([name,fn])=>{result.connections[name]=await fn();}));
  result.latencyMs=Date.now()-started;
  return res.status(200).json(result);
}
async function checkGitHub(){
  const token=process.env.HUDHUD_GITHUB_TOKEN, owner=process.env.HUDHUD_GITHUB_OWNER||"ElmiandCo", repo=process.env.HUDHUD_GITHUB_REPO||"HudHud";
  if(!token)return {status:"not_configured",detail:"HUDHUD_GITHUB_TOKEN is not set."};
  const t=Date.now();
  try{
    const r=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{headers:{Accept:"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2026-03-10"},signal:AbortSignal.timeout(8000)});
    if(!r.ok)return {status:r.status===401||r.status===403?"auth_error":"offline",detail:`GitHub HTTP ${r.status}`,latencyMs:Date.now()-t};
    const d=await r.json();return {status:"connected",detail:`${d.full_name||owner+"/"+repo} • ${d.default_branch||"main"}`,latencyMs:Date.now()-t};
  }catch(e){return {status:"offline",detail:"GitHub could not be reached.",latencyMs:Date.now()-t};}
}
async function checkVercel(){
  const token=process.env.HUDHUD_VERCEL_TOKEN, team=process.env.HUDHUD_VERCEL_TEAM_ID;
  if(!token)return {status:"not_configured",detail:"HUDHUD_VERCEL_TOKEN is not set."};
  const t=Date.now();
  try{
    const url=new URL("https://api.vercel.com/v9/projects");if(team)url.searchParams.set("teamId",team);
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
    if(!r.ok)return {status:r.status===401||r.status===403?"auth_error":"offline",detail:`Vercel HTTP ${r.status}`,latencyMs:Date.now()-t};
    const d=await r.json();return {status:"connected",detail:`${Array.isArray(d.projects)?d.projects.length:0} accessible project(s)`,latencyMs:Date.now()-t};
  }catch(e){return {status:"offline",detail:"Vercel could not be reached.",latencyMs:Date.now()-t};}
}
async function checkSupabase(){
  const base=process.env.HUDHUD_SUPABASE_URL, key=process.env.HUDHUD_SUPABASE_KEY;
  if(!base||!key)return {status:"not_configured",detail:"Supabase server-side connection is not configured."};
  const t=Date.now();
  try{
    const r=await fetch(base.replace(/\/$/,"")+"/rest/v1/",{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000)});
    if(!r.ok)return {status:r.status===401||r.status===403?"auth_error":"offline",detail:`Supabase HTTP ${r.status}`,latencyMs:Date.now()-t};
    return {status:"connected",detail:"PostgREST responded.",latencyMs:Date.now()-t};
  }catch(e){return {status:"offline",detail:"Supabase could not be reached.",latencyMs:Date.now()-t};}
}