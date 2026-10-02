/* HudHud Connector Core v1
 * Deterministic connector catalog + on-the-spot connector builder.
 * Safe by design: this creates a declarative connector recipe; secrets are never
 * stored in browser/localStorage and arbitrary endpoints are never executed here.
 */
(function(){
  "use strict";

  const STORAGE_KEY="hudhud_connector_specs_v1";
  const LOGOS="https://cdn.simpleicons.org/";

  const catalog=[
    {id:"instagram",name:"Instagram",category:"social",icon:"instagram",auth:"oauth2"},
    {id:"facebook",name:"Facebook",category:"social",icon:"facebook",auth:"oauth2"},
    {id:"x",name:"X",category:"social",icon:"x",auth:"oauth2"},
    {id:"tiktok",name:"TikTok",category:"social",icon:"tiktok",auth:"oauth2"},
    {id:"linkedin",name:"LinkedIn",category:"social",icon:"linkedin",auth:"oauth2"},
    {id:"youtube",name:"YouTube",category:"social",icon:"youtube",auth:"oauth2"},
    {id:"threads",name:"Threads",category:"social",icon:"threads",auth:"oauth2"},
    {id:"discord",name:"Discord",category:"social",icon:"discord",auth:"oauth2"},
    {id:"reddit",name:"Reddit",category:"social",icon:"reddit",auth:"oauth2"},
    {id:"github",name:"GitHub",category:"build",icon:"github",auth:"oauth2"},
    {id:"vercel",name:"Vercel",category:"build",icon:"vercel",auth:"oauth2"},
    {id:"supabase",name:"Supabase",category:"build",icon:"supabase",auth:"api_key"},
    {id:"stripe",name:"Stripe",category:"build",icon:"stripe",auth:"oauth2"},
    {id:"slack",name:"Slack",category:"build",icon:"slack",auth:"oauth2"},
    {id:"notion",name:"Notion",category:"build",icon:"notion",auth:"oauth2"},
    {id:"googledrive",name:"Google Drive",category:"build",icon:"googledrive",auth:"oauth2"},
    {id:"googlecalendar",name:"Google Calendar",category:"build",icon:"googlecalendar",auth:"oauth2"},
    {id:"figma",name:"Figma",category:"build",icon:"figma",auth:"oauth2"},
    {id:"twilio",name:"Twilio",category:"build",icon:"twilio",auth:"api_key"},
    {id:"openai",name:"OpenAI",category:"ai",icon:"openai",auth:"api_key"},
    {id:"anthropic",name:"Anthropic",category:"ai",icon:"anthropic",auth:"api_key"},
    {id:"zapier",name:"Zapier",category:"build",icon:"zapier",auth:"oauth2"},
    {id:"shopify",name:"Shopify",category:"build",icon:"shopify",auth:"oauth2"}
  ];

  const protocol=[
    "IDENTIFY: match the service to the catalog before building anything.",
    "AUTH: use the provider's official OAuth/API-key method; never ask the user to paste a secret into chat.",
    "SCOPE: request only the permissions needed for the requested task.",
    "BUILD: create a declarative connector spec with base URL, auth type, scopes, actions and health check.",
    "VALIDATE: check required fields, HTTPS, allowed auth type and provider documentation before activation.",
    "EXECUTE: only a server-side approved gateway may send requests. Never execute arbitrary browser URLs.",
    "FAIL: explain the missing approval/credential/endpoint; do not invent credentials or pretend a connector is live.",
    "REMEMBER: save connector metadata and capabilities, never access tokens or secrets in local storage."
  ];

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch(e){return[]}}
  function write(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows))}
  function logo(item){
    return item.icon
      ? '<img src="'+LOGOS+encodeURIComponent(item.icon)+'" alt="'+esc(item.name)+' logo" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="connector-monogram">'+esc(item.name.slice(0,2).toUpperCase())+'</span>';
  }
  function itemById(id){return catalog.find(x=>x.id===id)||null}

  function connectorCard(item,custom){
    const meta=custom?custom: item;
    return '<article class="connector-card" data-connector-card="'+esc(meta.id)+'">'+
      '<div class="connector-logo">'+(item?logo(item):'<span class="connector-monogram">'+esc(String(meta.name||"??").slice(0,2).toUpperCase())+'</span>')+'</div>'+
      '<div class="connector-card-copy"><strong>'+esc(meta.name)+'</strong><small>'+esc(meta.category||"custom")+' • '+esc(meta.auth||"custom")+'</small></div>'+
      '<button class="secondary connector-use" data-connector-use="'+esc(meta.id)+'">'+(custom?"Open":"Build")+'</button>'+
    '</article>';
  }

  function modal(){
    let host=document.getElementById("connectorCoreModal");
    if(!host){host=document.createElement("div");host.id="connectorCoreModal";document.body.appendChild(host)}
    return host;
  }

  function openHub(defaultCategory){
    const host=modal(), custom=read();
    const category=defaultCategory||"all";
    const filtered=catalog.filter(x=>category==="all"||x.category===category);
    host.innerHTML='<div class="connector-modal-backdrop" data-connector-close></div>'+
      '<section class="connector-modal" role="dialog" aria-modal="true" aria-labelledby="connectorTitle">'+
      '<button class="connector-close" data-connector-close>×</button>'+
      '<div class="eyebrow">HUDHUD CONNECTOR CORE</div><h2 id="connectorTitle">More integrations</h2>'+
      '<p class="connector-subtitle">Choose a service HudHud already understands, or build a connector on the spot.</p>'+
      '<div class="connector-tabs">'+
      '<button class="'+(category==="all"?"active":"")+'" data-connector-tab="all">All</button>'+
      '<button class="'+(category==="social"?"active":"")+'" data-connector-tab="social">Social</button>'+
      '<button class="'+(category==="build"?"active":"")+'" data-connector-tab="build">Build</button>'+
      '<button class="'+(category==="ai"?"active":"")+'" data-connector-tab="ai">AI</button>'+
      '</div>'+
      '<div class="connector-grid">'+filtered.map(x=>connectorCard(x)).join("")+'</div>'+
      (custom.length?'<div class="connector-custom-section"><div class="eyebrow">YOUR ON-THE-SPOT CONNECTORS</div><div class="connector-grid">'+custom.map(x=>connectorCard(itemById(x.provider_id),x)).join("")+'</div></div>':"")+
      '<div class="connector-builder-callout"><div><strong>Don’t see it?</strong><span>HudHud can turn an API description into a connector recipe without needing a smarter model.</span></div><button class="primary" data-connector-new>＋ Build connector</button></div>'+
      '</section>';
    host.querySelectorAll("[data-connector-close]").forEach(b=>b.onclick=()=>host.innerHTML="");
    host.querySelectorAll("[data-connector-tab]").forEach(b=>b.onclick=()=>openHub(b.dataset.connectorTab));
    host.querySelectorAll("[data-connector-use]").forEach(b=>b.onclick=()=>openBuilder(b.dataset.connectorUse));
    host.querySelector("[data-connector-new]").onclick=()=>openBuilder(null);
  }

  function openBuilder(providerId){
    const host=modal(), known=itemById(providerId), existing=read().find(x=>x.id===providerId);
    host.innerHTML='<div class="connector-modal-backdrop" data-connector-close></div>'+
      '<section class="connector-modal connector-builder" role="dialog" aria-modal="true">'+
      '<button class="connector-close" data-connector-close>×</button>'+
      '<div class="eyebrow">BUILD ON THE SPOT</div><h2>'+(known?"Configure "+esc(known.name):"Build a new connector")+'</h2>'+
      '<p class="connector-subtitle">HudHud creates the integration recipe first. Credentials are added through the secure gateway later.</p>'+
      '<form id="connectorBuilderForm" class="connector-form">'+
      '<label>Service name<input name="name" required maxlength="80" value="'+esc(existing?.name||known?.name||"")+'" placeholder="Example: Acme CRM"></label>'+
      '<label>API base URL<input name="baseUrl" type="url" required placeholder="https://api.example.com/v1" value="'+esc(existing?.base_url||"")+'"></label>'+
      '<div class="connector-form-grid"><label>Category<select name="category"><option value="social">Social</option><option value="build">Build</option><option value="ai">AI</option><option value="business">Business</option><option value="other">Other</option></select></label>'+
      '<label>Authentication<select name="auth"><option value="oauth2">OAuth 2.0</option><option value="api_key">API key</option><option value="bearer">Bearer token</option><option value="none">No authentication</option></select></label></div>'+
      '<label>Permissions / scopes<input name="scopes" maxlength="800" placeholder="profile, read, write" value="'+esc(existing?.scopes?.join(", ")||"")+'"></label>'+
      '<label>Actions HudHud should support<textarea name="actions" maxlength="1200" placeholder="Example: read profile; list posts; publish post; upload media">'+esc(existing?.actions?.join("\n")||"")+'</textarea></label>'+
      '<div class="connector-builder-rules"><strong>HudHud will enforce</strong><span>HTTPS only • least privilege • no secrets in browser • server-side execution • no invented credentials</span></div>'+
      '<div id="connectorBuilderError" class="auth-error"></div>'+
      '<div class="form-actions"><button type="button" class="secondary" data-connector-close>Cancel</button><button class="primary" type="submit">Build connector recipe</button></div>'+
      '</form></section>';
    host.querySelectorAll("[data-connector-close]").forEach(b=>b.onclick=()=>host.innerHTML="");
    const form=host.querySelector("#connectorBuilderForm");
    form.category.value=existing?.category||known?.category||"build";
    form.auth.value=existing?.auth||known?.auth||"oauth2";
    form.onsubmit=e=>{
      e.preventDefault();
      const f=new FormData(form),name=String(f.get("name")||"").trim(),baseUrl=String(f.get("baseUrl")||"").trim();
      const error=host.querySelector("#connectorBuilderError");
      let url;try{url=new URL(baseUrl)}catch{if(error)error.textContent="Enter a valid HTTPS API base URL.";return}
      if(url.protocol!=="https:"){if(error)error.textContent="Connector gateways require HTTPS.";return}
      const scopes=String(f.get("scopes")||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
      const actions=String(f.get("actions")||"").split(/\n|;/).map(x=>x.trim()).filter(Boolean);
      if(!actions.length){if(error)error.textContent="Give HudHud at least one action.";return}
      const id=known?.id||("custom_"+name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")+"_"+Date.now());
      const spec={id,name,provider_id:known?.id||null,category:String(f.get("category")),auth:String(f.get("auth")),base_url:url.origin+url.pathname.replace(/\/$/,""),scopes,actions,health_check:{method:"GET",path:"/"},status:"recipe_ready",created_at:new Date().toISOString(),protocol_version:"1.0"};
      const rows=read().filter(x=>x.id!==id);rows.unshift(spec);write(rows);
      host.innerHTML='<div class="connector-modal-backdrop" data-connector-close></div><section class="connector-modal connector-success"><div class="eyebrow">RECIPE READY</div><h2>'+esc(name)+' is mapped.</h2><p class="connector-subtitle">HudHud now has a deterministic connector definition. The next step is secure authorization through the provider gateway.</p><div class="connector-recipe"><div><span>AUTH</span><strong>'+esc(spec.auth)+'</strong></div><div><span>BASE</span><strong>'+esc(spec.base_url)+'</strong></div><div><span>SCOPES</span><strong>'+esc(spec.scopes.join(", ")||"none")+'</strong></div><div><span>ACTIONS</span><strong>'+esc(spec.actions.join(" • "))+'</strong></div></div><div class="connector-builder-rules"><strong>Runtime rule</strong><span>HudHud may use this recipe, but it must not execute the endpoint until the server-side gateway has approved the host and the user has authorized the connection.</span></div><div class="form-actions"><button class="primary" data-connector-done>Done</button></div></section>';
      host.querySelector("[data-connector-done]").onclick=()=>openHub("all");
    };
  }

  function inject(){
    const main=document.getElementById("main");if(!main)return;
    if(main.querySelector(".social-page")&&!main.querySelector("[data-open-connector-hub='social']")){
      const head=main.querySelector(".social-page .section-head");
      if(head){const b=document.createElement("button");b.className="secondary connector-more-button";b.dataset.openConnectorHub="social";b.textContent="＋ More apps";b.onclick=()=>openHub("social");head.appendChild(b)}
    }
    if((main.querySelector(".tool-grid")||main.querySelector(".studio-grid"))&&!main.querySelector("[data-open-connector-hub='build']")){
      const target=main.querySelector(".section-head");
      if(target){const b=document.createElement("button");b.className="secondary connector-more-button";b.dataset.openConnectorHub="build";b.textContent="＋ More services";b.onclick=()=>openHub("build");target.appendChild(b)}
    }
  }

  window.HudHudConnectorCore={
    version:"1.0",
    catalog,
    protocol,
    openHub,
    openBuilder,
    buildConnector:(input)=>{
      const name=String(input?.name||"").trim(),baseUrl=String(input?.baseUrl||"").trim();
      if(!name||!/^https:\/\//i.test(baseUrl))throw new Error("Connector requires a name and HTTPS base URL.");
      return {name,base_url:baseUrl,auth:input.auth||"oauth2",scopes:Array.isArray(input.scopes)?input.scopes:[],actions:Array.isArray(input.actions)?input.actions:[],status:"recipe_ready",protocol_version:"1.0"};
    }
  };

  const observer=new MutationObserver(inject);
  const start=()=>{inject();observer.observe(document.getElementById("main")||document.body,{childList:true,subtree:true})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();