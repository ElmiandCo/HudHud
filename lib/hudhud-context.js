function env(name){return String(process.env[name]||"").trim();}
function baseUrl(){
  return env("HUDHUD_SUPABASE_URL")
    .replace(/\/+$/,"")
    .replace(/\/(?:rest\/v1|auth\/v1)$/i,"");
}
function key(){return env("HUDHUD_SUPABASE_KEY");}

async function supabaseRequest(path, token){
  const base=baseUrl(), apiKey=key();
  if(!base||!apiKey) throw new Error("Supabase server configuration is incomplete.");
  const response=await fetch(base+"/rest/v1/"+path,{
    headers:{
      apikey:apiKey,
      Authorization:"Bearer "+token,
      Accept:"application/json"
    }
  });
  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw);}catch{data=null;}
  if(!response.ok) throw new Error("Supabase context query failed.");
  return data;
}

export async function getAuthenticatedUser(token){
  const base=baseUrl(), apiKey=key();
  if(!base||!apiKey||!token) throw new Error("Authentication required.");
  const response=await fetch(base+"/auth/v1/user",{
    headers:{apikey:apiKey,Authorization:"Bearer "+token}
  });
  if(!response.ok) throw new Error("Authentication expired. Please sign in again.");
  return response.json();
}

function cleanProfile(row){
  if(!row)return null;
  return {
    id:row.id,
    display_name:row.display_name,
    username:row.username,
    first_name:row.first_name,
    last_name:row.last_name,
    bio:row.bio,
    location:row.location,
    website:row.website,
    city:row.city,
    state:row.state,
    country:row.country,
    community:row.community,
    profile_title:row.profile_title,
    x_handle:row.x_handle,
    tiktok_username:row.tiktok_username,
    instagram_handle:row.instagram_handle
  };
}

function cleanKnowledge(rows){
  return (rows||[]).map(row=>({
    category:row.category,
    title:row.title,
    value:row.value,
    source:row.source,
    confidence:row.confidence,
    status:row.status,
    first_observed_at:row.first_observed_at,
    last_observed_at:row.last_observed_at,
    metadata:row.metadata||{}
  }));
}

function cleanLifeMap(rows){
  return (rows||[]).map(row=>({
    category:row.category,
    title:row.title,
    value:row.value,
    status:row.status,
    metadata:row.metadata||{},
    updated_at:row.updated_at
  }));
}

function cleanWorkspace(rows){
  return (rows||[]).map(row=>({
    name:row.name,
    description:row.description,
    status:row.status,
    updated_at:row.updated_at
  }));
}

function cleanIntegrations(rows){
  return (rows||[]).map(row=>({
    provider:row.provider,
    category:row.category,
    status:row.status,
    provider_account_id:row.provider_account_id,
    display_name:row.display_name,
    account_handle:row.account_handle,
    scopes:row.scopes||[],
    capabilities:row.capabilities||{},
    connected_at:row.connected_at,
    last_synced_at:row.last_synced_at,
    expires_at:row.expires_at,
    last_error:row.last_error
  }));
}

export async function buildHudHudContext(token, userId){
  const safeId=encodeURIComponent(userId);
  const [
    profiles,
    knowledge,
    lifemap,
    projects,
    opportunities,
    integrations
  ]=await Promise.all([
    supabaseRequest("profiles?select=id,display_name,username,first_name,last_name,bio,location,website,city,state,country,community,profile_title,x_handle,tiktok_username,instagram_handle&id=eq."+safeId+"&limit=1",token),
    supabaseRequest("hudhud_knowledge?select=category,title,value,source,confidence,status,first_observed_at,last_observed_at,metadata&user_id=eq."+safeId+"&user_visible=eq.true&ai_usable=eq.true&status=eq.Active&order=updated_at.desc&limit=100",token),
    supabaseRequest("hudhud_lifemap?select=category,title,value,status,metadata,updated_at&user_id=eq."+safeId+"&status=eq.Active&order=updated_at.desc&limit=100",token),
    supabaseRequest("hudhud_projects?select=name,description,status,updated_at&user_id=eq."+safeId+"&status=neq.Done&order=updated_at.desc&limit=25",token),
    supabaseRequest("hudhud_opportunities?select=name,description,status,updated_at&user_id=eq."+safeId+"&status=neq.Closed&order=updated_at.desc&limit=25",token),
    supabaseRequest("hudhud_integrations?select=provider,category,status,provider_account_id,display_name,account_handle,scopes,capabilities,connected_at,last_synced_at,expires_at,last_error&user_id=eq."+safeId+"&order=updated_at.desc&limit=50",token)
  ]);
  return {
    user:{id:userId},
    profile:cleanProfile(profiles?.[0]||null),
    life_map:cleanLifeMap(lifemap),
    knowledge:cleanKnowledge(knowledge),
    active_projects:cleanWorkspace(projects),
    active_opportunities:cleanWorkspace(opportunities),
    integrations:cleanIntegrations(integrations)
  };
}

export function contextPrompt(context){
  return [
    "HUDHUD USER CONTEXT (authorized, user-scoped):",
    JSON.stringify(context),
    "",
    "Context rules:",
    "- Treat LifeMap as user-defined intent and plans, not inferred facts.",
    "- Treat Knowledge as observations with source/confidence metadata; do not invent missing facts.",
    "- Integrations describe authorized connections only; they do not grant permission to perform an action by themselves.",
    "- Never expose access tokens, secrets, or internal authorization credentials.",
    "- If the user's request requires an external action, use only an explicitly authorized tool/connection and follow its scope.",
    "- If context conflicts with the user's current message, the current message controls unless a permission or safety constraint applies."
  ].join("\n");
}
