/* HudHud Connector Core v2
 * Shared connector catalog + reusable in-app store + deterministic builder.
 * UI metadata may live in the browser; secrets/tokens never do.
 */
(function(){
  "use strict";

  const STORAGE_KEY="hudhud_connector_specs_v1";
  const LOGOS="https://cdn.simpleicons.org/";

  const catalog=[
    // Health / personal intelligence
    {id:"apple-health",name:"Apple Health",category:"health",icon:"apple",auth:"native",tags:["health","apple","watch","activity","nutrition"]},
    {id:"apple-watch",name:"Apple Watch",category:"health",icon:"apple",auth:"native",tags:["health","watch","activity","heart"]},
    {id:"nutrition",name:"Nutrition",category:"health",icon:"applehealth",auth:"native",tags:["health","diet","meals","nutrition"]},
    {id:"financial-transactions",name:"Financial Transactions",category:"finance",icon:"plaid",auth:"oauth2",tags:["finance","transactions","spending","budget"]},
    // Social
    {id:"instagram",name:"Instagram",category:"social",icon:"instagram",auth:"oauth2",tags:["social","content","photo","video"]},
    {id:"facebook",name:"Facebook",category:"social",icon:"facebook",auth:"oauth2",tags:["social","content","community"]},
    {id:"x",name:"X",category:"social",icon:"x",auth:"oauth2",tags:["social","content","news"]},
    {id:"tiktok",name:"TikTok",category:"social",icon:"tiktok",auth:"oauth2",tags:["social","content","video"]},
    {id:"linkedin",name:"LinkedIn",category:"social",icon:"linkedin",auth:"oauth2",tags:["social","business","professional"]},
    {id:"youtube",name:"YouTube",category:"social",icon:"youtube",auth:"oauth2",tags:["social","content","video"]},
    {id:"threads",name:"Threads",category:"social",icon:"threads",auth:"oauth2",tags:["social","content"]},
    {id:"discord",name:"Discord",category:"social",icon:"discord",auth:"oauth2",tags:["social","community","communication"]},
    {id:"reddit",name:"Reddit",category:"social",icon:"reddit",auth:"oauth2",tags:["social","community","content"]},

    // Build / developer
    {id:"github",name:"GitHub",category:"developer",icon:"github",auth:"oauth2",tags:["developer","code","git","projects"]},
    {id:"vercel",name:"Vercel",category:"developer",icon:"vercel",auth:"oauth2",tags:["developer","hosting","deployment"]},
    {id:"supabase",name:"Supabase",category:"developer",icon:"supabase",auth:"api_key",tags:["developer","database","auth"]},
    {id:"figma",name:"Figma",category:"design",icon:"figma",auth:"oauth2",tags:["design","developer","prototype"]},
    {id:"stripe",name:"Stripe",category:"business",icon:"stripe",auth:"oauth2",tags:["business","payments","finance"]},
    {id:"shopify",name:"Shopify",category:"business",icon:"shopify",auth:"oauth2",tags:["business","commerce","payments"]},
    {id:"zapier",name:"Zapier",category:"automation",icon:"zapier",auth:"oauth2",tags:["automation","workflow","business"]},

    // Productivity / work
    {id:"notion",name:"Notion",category:"productivity",icon:"notion",auth:"oauth2",tags:["productivity","documents","projects"]},
    {id:"googledrive",name:"Google Drive",category:"productivity",icon:"googledrive",auth:"oauth2",tags:["productivity","documents","files"]},
    {id:"googlecalendar",name:"Google Calendar",category:"productivity",icon:"googlecalendar",auth:"oauth2",tags:["productivity","calendar","scheduling"]},
    {id:"slack",name:"Slack",category:"communication",icon:"slack",auth:"oauth2",tags:["communication","team","business"]},
    {id:"twilio",name:"Twilio",category:"communication",icon:"twilio",auth:"api_key",tags:["communication","sms","voice"]},

    // AI
    {id:"openai",name:"OpenAI",category:"ai",icon:"openai",auth:"api_key",tags:["ai","llm","automation"]},
    {id:"anthropic",name:"Anthropic",category:"ai",icon:"anthropic",auth:"api_key",tags:["ai","llm","automation"]},
    {id:"groq",name:"Groq",category:"ai",icon:"groq",auth:"api_key",tags:["ai","llm","fast"]},
    {id:"gemini",name:"Google Gemini",category:"ai",icon:"googlegemini",auth:"api_key",tags:["ai","llm","google"]},

    // Common extensions
    {id:"gmail",name:"Gmail",category:"communication",icon:"gmail",auth:"oauth2",tags:["communication","email","google"]},
    {id:"googlesheets",name:"Google Sheets",category:"productivity",icon:"googlesheets",auth:"oauth2",tags:["productivity","data","google"]},
    {id:"dropbox",name:"Dropbox",category:"productivity",icon:"dropbox",auth:"oauth2",tags:["productivity","files","documents"]},
    {id:"linear",name:"Linear",category:"developer",icon:"linear",auth:"oauth2",tags:["developer","projects","issues"]},
    {id:"asana",name:"Asana",category:"productivity",icon:"asana",auth:"oauth2",tags:["productivity","projects","tasks"]},
    {id:"monday",name:"monday.com",category:"productivity",icon:"mondaydotcom",auth:"oauth2",tags:["productivity","projects","tasks"]},
    {id:"airtable",name:"Airtable",category:"productivity",icon:"airtable",auth:"oauth2",tags:["productivity","database","data"]},
    {id:"wordpress",name:"WordPress",category:"content",icon:"wordpress",auth:"oauth2",tags:["content","website","publishing"]},
    {id:"mailchimp",name:"Mailchimp",category:"content",icon:"mailchimp",auth:"oauth2",tags:["content","email","marketing"]},
    {id:"calendly",name:"Calendly",category:"productivity",icon:"calendly",auth:"oauth2",tags:["productivity","calendar","scheduling"]}
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

  const categoryLabels={
    all:"All",popular:"Popular",social:"Social",developer:"Developer",design:"Design",
    ai:"AI",productivity:"Productivity",communication:"Communication",business:"Business",finance:"Finance",health:"Health",
    automation:"Automation",content:"Content"
  };
  const pageMaps={
    social:{title:"Social Apps",subtitle:"Connect the platforms HudHud can publish, monitor, and organize for you.",categories:["all","popular","social","content","communication"]},
    connections:{title:"Connector Store",subtitle:"Browse every service HudHud can connect to, with one consistent search and filter system.",categories:["all","popular","social","developer","ai","productivity","communication","business","finance","health","automation","content"]},
    tools:{title:"Build & Developer Store",subtitle:"Connect the tools HudHud can use to build, deploy, design, and automate.",categories:["all","popular","developer","design","ai","automation","business","health","finance"]},
    studio:{title:"Studio App Store",subtitle:"Bring content, AI, publishing, and creative tools into your HudHud workflow.",categories:["all","popular","ai","content","design","productivity","social","health"]},
    projects:{title:"Project Connections",subtitle:"Choose the services that belong to your projects and development workflows.",categories:["all","popular","developer","design","productivity","communication","automation"]},
    documents:{title:"Document & Content Store",subtitle:"Connect storage, documents, publishing, and content tools.",categories:["all","popular","productivity","content","communication"]},
    messages:{title:"Communication Store",subtitle:"Connect the services HudHud can use to communicate and coordinate.",categories:["all","popular","communication","social","productivity"]},
    newsletter:{title:"Newsletter Connections",subtitle:"Connect publishing, email, audience, and content services.",categories:["all","popular","content","communication","social"]},
    siteprogram:{title:"Site Launch Connections",subtitle:"Connect development, deployment, domains, content, and analytics tools.",categories:["all","popular","developer","content","design","automation"]},
    videoprogram:{title:"AI Video Connections",subtitle:"Connect AI, video publishing, storage, and social platforms.",categories:["all","popular","ai","social","content","productivity"]}
  };

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch(e){return[]}}
  function write(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows))}
  function logo(item){
    return item.icon
      ? '<img src="'+LOGOS+encodeURIComponent(item.icon)+'" alt="'+esc(item.name)+' logo" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="connector-monogram">'+esc(item.name.slice(0,2).toUpperCase())+"</span>";
  }
  function itemById(id){return catalog.find(x=>x.id===id)||null}

  function card(item,custom){
    const meta=custom||item, known=item||itemById(custom?.provider_id);
    const ready=!!custom;
    return '<article class="connector-store-card" data-store-card="'+esc(meta.id)+'">'+
      '<div class="connector-store-card-top"><div class="connector-logo">'+(known?logo(known):'<span class="connector-monogram">'+esc(String(meta.name||"??").slice(0,2).toUpperCase())+"</span>")+'</div>'+
      '<span class="connector-status '+(ready?"recipe":"available")+'">'+(ready?"Ready":"Available")+"</span></div>"+
      '<div class="connector-store-copy"><h3>'+esc(meta.name)+'</h3><p>'+esc(categoryLabels[meta.category]||meta.category||"Custom")+' · '+esc(meta.auth||"custom")+"</p></div>"+
      '<div class="connector-tags">'+(meta.tags||[]).slice(0,3).map(t=>"<span>"+esc(t)+"</span>").join("")+"</div>"+
      '<button class="connector-store-action '+(ready?"ready":"")+'" data-store-action="'+esc(meta.id)+'">'+(ready?"Manage":"Connect")+"</button>"+
      "</article>";
  }

  function openHub(defaultCategory){
    const host=modal(), custom=read();
    const category=defaultCategory||"all";
    const filtered=catalog.filter(x=>category==="all"||x.category===category);
    host.innerHTML='<div class="connector-modal-backdrop" data-connector-close></div>'+
      '<section class="connector-modal" role="dialog" aria-modal="true" aria-labelledby="connectorTitle">'+
      '<button class="connector-close" data-connector-close>×</button>'+
      '<div class="eyebrow">HUDHUD CONNECTOR CORE</div><h2 id="connectorTitle">App & Service Store</h2>'+
      '<p class="connector-subtitle">Search HudHud’s catalog, filter it by category, or build a connector when a service is missing.</p>'+
      '<div class="connector-store-search"><span>⌕</span><input id="connectorStoreSearch" placeholder="Search apps, services, tools..." autocomplete="off"></div>'+
      '<div class="connector-tabs">'+Object.entries(categoryLabels).slice(0,4).map(([k,v])=>'<button class="'+(category===k?"active":"")+'" data-connector-tab="'+k+'">'+v+"</button>").join("")+'</div>'+
      '<div class="connector-grid" id="connectorModalGrid">'+filtered.map(x=>card(x)).join("")+'</div>'+
      (custom.length?'<div class="connector-custom-section"><div class="eyebrow">YOUR CONNECTORS</div><div class="connector-grid">'+custom.map(x=>card(itemById(x.provider_id),x)).join("")+"</div></div>":"")+
      '<div class="connector-builder-callout"><div><strong>Don’t see it?</strong><span>HudHud can create a deterministic connector recipe from an API description.</span></div><button class="primary" data-connector-new>＋ Build connector</button></div>'+
      "</section>";
    bindModal();
    const search=host.querySelector("#connectorStoreSearch");
    search?.focus();
  }

  function bindModal(){
    const host=modal();
    host.querySelectorAll("[data-connector-close]").forEach(b=>b.onclick=()=>host.innerHTML="");
    host.querySelectorAll("[data-connector-tab]").forEach(b=>b.onclick=()=>openHub(b.dataset.connectorTab));
    host.querySelectorAll("[data-connector-new]").forEach(b=>b.onclick=()=>openBuilder(null));
    host.querySelectorAll("[data-store-action]").forEach(b=>b.onclick=()=>openBuilder(b.dataset.storeAction));
    const search=host.querySelector("#connectorStoreSearch");
    if(search) search.oninput=()=>{
      const q=search.value.trim().toLowerCase();
      host.querySelector("#connectorModalGrid").innerHTML=catalog.filter(x=>
        (!q||[x.name,x.category,...(x.tags||[])].join(" ").toLowerCase().includes(q))
      ).map(x=>card(x)).join("");
      host.querySelectorAll("[data-store-action]").forEach(b=>b.onclick=()=>openBuilder(b.dataset.storeAction));
    };
  }

  function modal(){
    let host=document.getElementById("connectorCoreModal");
    if(!host){host=document.createElement("div");host.id="connectorCoreModal";document.body.appendChild(host)}
    return host;
  }

  function renderStore(view){
    const main=document.getElementById("main"); if(!main||main.querySelector(".hudhud-connector-store"))return;
    const config=pageMaps[view]; if(!config)return;
    const custom=read();
    const buttons=config.categories.map(k=>'<button class="connector-filter '+(k==="all"?"active":"")+'" data-store-filter="'+k+'">'+esc(categoryLabels[k]||k)+"</button>").join("");
    main.insertAdjacentHTML("beforeend",
      '<section class="hudhud-connector-store" data-store-view="'+esc(view)+'">'+
      '<div class="connector-store-header"><div><div class="eyebrow">HUDHUD APP STORE</div><h2>'+esc(config.title)+'</h2><p>'+esc(config.subtitle)+'</p></div><span class="connector-count">'+catalog.length+' apps</span></div>'+
      '<div class="connector-store-toolbar"><div class="connector-store-search"><span>⌕</span><input data-store-search placeholder="Search apps, services, tools..." autocomplete="off"></div><div class="connector-filter-row">'+buttons+"</div></div>"+
      '<div class="connector-store-grid" data-store-grid></div>'+
      '<div class="connector-store-empty" hidden>No apps match that search. <button class="secondary" data-store-build>Build a connector</button></div>'+
      "</section>"
    );
    const store=main.querySelector(".hudhud-connector-store:last-child"),search=store.querySelector("[data-store-search]"),grid=store.querySelector("[data-store-grid]");
    let active="all";
    function draw(){
      const q=search.value.trim().toLowerCase();
      let rows=catalog.filter(x=>(active==="all"||active==="popular"||x.category===active) && (!q||[x.name,x.category,...(x.tags||[])].join(" ").toLowerCase().includes(q)));
      if(active==="popular")rows=catalog.filter(x=>["instagram","youtube","linkedin","github","vercel","supabase","openai","googlecalendar","googledrive","slack","stripe"].includes(x.id)).filter(x=>!q||[x.name,x.category,...x.tags].join(" ").toLowerCase().includes(q));
      const customRows=custom.filter(x=>active==="all"||active===x.category).filter(x=>!q||[x.name,x.category,...(x.tags||[])].join(" ").toLowerCase().includes(q));
      grid.innerHTML=rows.map(x=>card(x)).join("")+customRows.map(x=>card(itemById(x.provider_id),x)).join("");
      store.querySelector(".connector-store-empty").hidden=!!(rows.length||customRows.length);
      grid.querySelectorAll("[data-store-action]").forEach(b=>b.onclick=()=>openBuilder(b.dataset.storeAction));
    }
    store.querySelectorAll("[data-store-filter]").forEach(b=>b.onclick=()=>{
      active=b.dataset.storeFilter;
      store.querySelectorAll("[data-store-filter]").forEach(x=>x.classList.toggle("active",x===b));
      draw();
    });
    search.oninput=draw;
    store.querySelector("[data-store-build]").onclick=()=>openBuilder(null);
    draw();
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
      '<div class="connector-form-grid"><label>Category<select name="category"><option value="social">Social</option><option value="developer">Developer</option><option value="ai">AI</option><option value="productivity">Productivity</option><option value="communication">Communication</option><option value="business">Business</option><option value="content">Content</option><option value="other">Other</option></select></label>'+
      '<label>Authentication<select name="auth"><option value="oauth2">OAuth 2.0</option><option value="api_key">API key</option><option value="bearer">Bearer token</option><option value="none">No authentication</option></select></label></div>'+
      '<label>Permissions / scopes<input name="scopes" maxlength="800" placeholder="profile, read, write" value="'+esc(existing?.scopes?.join(", ")||"")+'"></label>'+
      '<label>Actions HudHud should support<textarea name="actions" maxlength="1200" placeholder="Example: read profile; list items; create item">'+esc(existing?.actions?.join("\n")||"")+'</textarea></label>'+
      '<div class="connector-builder-rules"><strong>HudHud will enforce</strong><span>HTTPS only • least privilege • no secrets in browser • server-side execution • no invented credentials</span></div>'+
      '<div id="connectorBuilderError" class="auth-error"></div><div class="form-actions"><button type="button" class="secondary" data-connector-close>Cancel</button><button class="primary" type="submit">Build connector recipe</button></div>'+
      '</form></section>';
    host.querySelectorAll("[data-connector-close]").forEach(b=>b.onclick=()=>host.innerHTML="");
    const form=host.querySelector("#connectorBuilderForm");
    form.category.value=existing?.category||known?.category||"developer";
    form.auth.value=existing?.auth||known?.auth||"oauth2";
    form.onsubmit=e=>{
      e.preventDefault();
      const f=new FormData(form),name=String(f.get("name")||"").trim(),baseUrl=String(f.get("baseUrl")||"").trim(),error=host.querySelector("#connectorBuilderError");
      let url;try{url=new URL(baseUrl)}catch{if(error)error.textContent="Enter a valid HTTPS API base URL.";return}
      if(url.protocol!=="https:"){if(error)error.textContent="Connector gateways require HTTPS.";return}
      const scopes=String(f.get("scopes")||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
      const actions=String(f.get("actions")||"").split(/\n|;/).map(x=>x.trim()).filter(Boolean);
      if(!actions.length){if(error)error.textContent="Give HudHud at least one action.";return}
      const id=known?.id||("custom_"+name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")+"_"+Date.now());
      const spec={id,name,provider_id:known?.id||null,category:String(f.get("category")),auth:String(f.get("auth")),base_url:url.origin+url.pathname.replace(/\/$/,""),scopes,actions,tags:[String(f.get("category"))],health_check:{method:"GET",path:"/"},status:"recipe_ready",created_at:new Date().toISOString(),protocol_version:"2.0"};
      write([spec,...read().filter(x=>x.id!==id)]);
      host.innerHTML='<div class="connector-modal-backdrop" data-connector-close></div><section class="connector-modal connector-success"><div class="eyebrow">RECIPE READY</div><h2>'+esc(name)+' is mapped.</h2><p class="connector-subtitle">HudHud now has a deterministic connector definition. The next step is secure authorization through the provider gateway.</p><div class="connector-recipe"><div><span>AUTH</span><strong>'+esc(spec.auth)+'</strong></div><div><span>BASE</span><strong>'+esc(spec.base_url)+'</strong></div><div><span>SCOPES</span><strong>'+esc(spec.scopes.join(", ")||"none")+'</strong></div><div><span>ACTIONS</span><strong>'+esc(spec.actions.join(" • "))+'</strong></div></div><div class="connector-builder-rules"><strong>Runtime rule</strong><span>HudHud may use this recipe, but it must not execute the endpoint until the server-side gateway has approved the host and the user has authorized the connection.</span></div><div class="form-actions"><button class="primary" data-connector-done>Done</button></div></section>';
      host.querySelector("[data-connector-done]").onclick=()=>openHub("all");
    };
  }

  function currentView(){
    const active=document.querySelector('#nav [data-view].active')||document.querySelector('[data-view].active');
    return active?.dataset?.view||"";
  }

  function inject(){
    const main=document.getElementById("main");if(!main)return;
    const view=currentView();
    if(pageMaps[view])renderStore(view);

    if(main.querySelector(".social-page")&&!main.querySelector("[data-open-connector-hub='social']")){
      const head=main.querySelector(".social-page .section-head");
      if(head){const b=document.createElement("button");b.className="secondary connector-more-button";b.dataset.openConnectorHub="social";b.textContent="＋ Open store";b.onclick=()=>openHub("social");head.appendChild(b)}
    }
    if((main.querySelector(".tool-grid")||main.querySelector(".studio-grid"))&&!main.querySelector("[data-open-connector-hub='build']")){
      const target=main.querySelector(".section-head");
      if(target){const b=document.createElement("button");b.className="secondary connector-more-button";b.dataset.openConnectorHub="build";b.textContent="＋ Open store";b.onclick=()=>openHub("build");target.appendChild(b)}
    }
  }

  window.HudHudConnectorCore={
    version:"2.0",
    catalog,protocol,openHub,openBuilder,
    buildConnector:(input)=>{
      const name=String(input?.name||"").trim(),baseUrl=String(input?.baseUrl||"").trim();
      if(!name||!/^https:\/\//i.test(baseUrl))throw new Error("Connector requires a name and HTTPS base URL.");
      return {name,base_url:baseUrl,auth:input.auth||"oauth2",scopes:Array.isArray(input.scopes)?input.scopes:[],actions:Array.isArray(input.actions)?input.actions:[],status:"recipe_ready",protocol_version:"2.0"};
    }
  };

  const observer=new MutationObserver(inject);
  const start=()=>{inject();observer.observe(document.getElementById("main")||document.body,{childList:true,subtree:true})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();