/* HudHud Health Core
 * Core understanding layer for health, nutrition and financial behavior.
 * Browser-safe: no secrets, no bank credentials, no raw HealthKit access.
 * Native Apple Health/Watch and financial providers feed this model through approved connectors.
 */
(function(){
  "use strict";
  const KEY="hudhud_health_core_v1";
  const seed={
    profile:{calorieTarget:2200,proteinTarget:140,waterTarget:8},
    sources:[
      {id:"apple-health",name:"Apple Health",icon:"♥",status:"planned",description:"Health and fitness data from Apple Health / Apple Watch."},
      {id:"nutrition",name:"Nutrition",icon:"🥗",status:"ready",description:"Meals, nutrition targets and food history."},
      {id:"financial",name:"Financial Transactions",icon:"$",status:"planned",description:"Authorized transaction feeds used for spending and food-pattern insights."}
    ],
    meals:[],
    transactions:[],
    observations:[]
  };
  function load(){try{return Object.assign({},seed,JSON.parse(localStorage.getItem(KEY)||"{}"));}catch(e){return JSON.parse(JSON.stringify(seed));}}
  function save(s){localStorage.setItem(KEY,JSON.stringify(s));}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function money(n){return new Intl.NumberFormat(undefined,{style:"currency",currency:"USD"}).format(Number(n||0));}
  function today(){return new Date().toISOString().slice(0,10);}
  function calc(s){
    const day=today(), meals=s.meals.filter(x=>x.date===day), tx=s.transactions.filter(x=>x.date===day);
    const calories=meals.reduce((n,x)=>n+Number(x.calories||0),0);
    const protein=meals.reduce((n,x)=>n+Number(x.protein||0),0);
    const foodSpend=tx.filter(x=>["groceries","restaurant","coffee","fast-food","food"].includes(x.category)).reduce((n,x)=>n+Number(x.amount||0),0);
    const spend=tx.reduce((n,x)=>n+Number(x.amount||0),0);
    return {meals,tx,calories,protein,foodSpend,spend};
  }
  function insightList(s){
    const c=calc(s), out=[];
    if(c.calories===0)out.push(["🍽️","No meals logged today","HudHud can combine your food log with activity data once Apple Health is connected."]);
    else if(c.calories<s.profile.calorieTarget*.65)out.push(["⚡","Nutrition is below your daily target","Your logged intake is currently below the target you set."]);
    else if(c.calories>s.profile.calorieTarget*1.15)out.push(["📊","Calories are above your target","HudHud can show the pattern without making the decision for you."]);
    if(c.protein<s.profile.proteinTarget*.65)out.push(["🥩","Protein target is not yet met","Add protein-rich foods to your next meal if that matches your goal."]);
    if(c.foodSpend>0)out.push(["💳","Food spending detected","HudHud can connect meal patterns with authorized transaction categories."]);
    if(!out.length)out.push(["🧠","HudHud is learning your pattern","As more authorized data arrives, this layer can surface relationships between activity, nutrition and spending."]);
    return out;
  }
  function modal(title,body){
    let host=document.getElementById("healthModalHost");
    if(!host){host=document.createElement("div");host.id="healthModalHost";document.body.appendChild(host);}
    host.innerHTML='<div class="health-modal-backdrop" data-health-close></div><section class="health-modal-dialog"><button class="health-close" data-health-close>×</button><div class="eyebrow">HUDHUD HEALTH</div><h2>'+esc(title)+'</h2>'+body+'</section>';
    host.querySelectorAll("[data-health-close]").forEach(x=>x.onclick=()=>host.innerHTML="");
  }
  function connectApple(){
    modal("Connect Apple Health",'<p class="health-modal-copy">HudHud Health uses the Apple Health app as the bridge for Apple Watch data. The website cannot directly read Watch data from a browser.</p><div class="health-flow"><span>⌚ Apple Watch</span><b>→</b><span>♥ Apple Health</span><b>→</b><span>🐦 HudHud Health</span><b>→</b><span>HQ</span></div><div class="health-permission"><strong>Native companion required</strong><small>The HudHud iPhone companion will request only the health categories you approve, then securely sync authorized summaries to HudHud.</small></div><div class="health-modal-actions"><button class="primary" data-health-native>Prepare Apple Health connection</button><button class="secondary" data-health-close>Close</button></div>');
    document.querySelector("[data-health-native]")?.addEventListener("click",()=>{toastHealth("Apple Health connector is staged. The native iPhone companion still needs to be installed and signed.");});
  }
  function connectFinance(){
    modal("Connect Transactions",'<p class="health-modal-copy">Financial data is a separate connector. HudHud will never ask you to paste bank credentials into chat.</p><div class="health-permission"><strong>Authorized financial feed</strong><small>When a supported financial provider is configured, HudHud can normalize merchant, amount, date and category data for your personal insights.</small></div><div class="health-chip-row"><span>Groceries</span><span>Restaurants</span><span>Coffee</span><span>Fast food</span><span>Pharmacy</span><span>Other</span></div><div class="health-modal-actions"><button class="primary" data-health-finance-stage>Stage financial connector</button><button class="secondary" data-health-close>Close</button></div>');
    document.querySelector("[data-health-finance-stage]")?.addEventListener("click",()=>{toastHealth("Financial connector staged. Provider authorization is required before live transactions appear.");});
  }
  function addMeal(){
    const s=load();
    modal("Log a meal",'<form class="health-form" id="healthMealForm"><label>Meal / food<input name="name" required placeholder="Chicken, rice, vegetables"></label><div class="health-form-grid"><label>Calories<input name="calories" type="number" min="0" step="1" placeholder="650"></label><label>Protein (g)<input name="protein" type="number" min="0" step="1" placeholder="45"></label></div><label>Date<input name="date" type="date" value="'+today()+'"></label><div class="health-modal-actions"><button class="primary" type="submit">Save meal</button><button class="secondary" type="button" data-health-close>Cancel</button></div></form>');
    document.getElementById("healthMealForm")?.addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.currentTarget);s.meals.unshift({id:"meal_"+Date.now(),name:String(f.get("name")).trim(),calories:Number(f.get("calories")||0),protein:Number(f.get("protein")||0),date:String(f.get("date")||today())});save(s);document.getElementById("healthModalHost").innerHTML="";render("health");});
  }
  function addTransaction(){
    const s=load();
    modal("Add transaction",'<form class="health-form" id="healthTxForm"><label>Merchant<input name="merchant" required placeholder="Grocery store"></label><div class="health-form-grid"><label>Amount<input name="amount" type="number" min="0" step=".01" required placeholder="42.50"></label><label>Category<select name="category"><option>groceries</option><option>restaurant</option><option>coffee</option><option>fast-food</option><option>pharmacy</option><option>other</option></select></label></div><label>Date<input name="date" type="date" value="'+today()+'"></label><div class="health-modal-actions"><button class="primary" type="submit">Save transaction</button><button class="secondary" type="button" data-health-close>Cancel</button></div></form>');
    document.getElementById("healthTxForm")?.addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.currentTarget);s.transactions.unshift({id:"tx_"+Date.now(),merchant:String(f.get("merchant")).trim(),amount:Number(f.get("amount")||0),category:String(f.get("category")),date:String(f.get("date")||today())});save(s);document.getElementById("healthModalHost").innerHTML="";render("health");});
  }
  function toastHealth(msg){const t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800);}
  function page(){
    const s=load(),c=calc(s),ins=insightList(s);
    const pct=Math.min(100,Math.round((c.calories/Math.max(1,s.profile.calorieTarget))*100));
    const ppct=Math.min(100,Math.round((c.protein/Math.max(1,s.profile.proteinTarget))*100));
    const src=s.sources;
    return '<div class="health-page"><div class="section-head health-hero"><div><span class="eyebrow">HUDHUD HEALTH • CORE UNDERSTANDING</span><h1>Health, Diet & Financial Behavior</h1><p class="muted">One permission-aware layer for understanding how activity, nutrition and authorized spending patterns relate.</p></div><div class="health-orb">♥</div></div>'+
      '<section class="health-connection-strip"><div><strong>Connection graph</strong><span>HudHud learns from authorized sources, then turns separate signals into useful context.</span></div><div class="health-flow-mini"><span>⌚</span><i>→</i><span>♥</span><i>→</i><span>🥗</span><i>→</i><span>💳</span><i>→</i><span>🧠</span></div></section>'+
      '<div class="health-source-grid">'+src.map(x=>'<article class="health-source-card"><div class="health-source-icon">'+x.icon+'</div><div><span class="health-status '+x.status+'">'+(x.status==="ready"?"READY":"CONNECT")+'</span><h3>'+esc(x.name)+'</h3><p>'+esc(x.description)+'</p></div><button class="secondary health-source-action" data-health-source="'+x.id+'">'+(x.id==="apple-health"?"Connect":x.id==="financial"?"Connect":"Open")+'</button></article>').join("")+'</div>'+
      '<div class="health-metric-grid"><article class="health-metric"><span>CALORIES</span><strong>'+c.calories+'</strong><small>/ '+s.profile.calorieTarget+' target</small><div class="health-meter"><i style="width:'+pct+'%"></i></div></article><article class="health-metric"><span>PROTEIN</span><strong>'+c.protein+'g</strong><small>/ '+s.profile.proteinTarget+'g target</small><div class="health-meter"><i style="width:'+ppct+'%"></i></div></article><article class="health-metric"><span>FOOD SPEND</span><strong>'+money(c.foodSpend)+'</strong><small>today</small></article><article class="health-metric"><span>TRANSACTIONS</span><strong>'+c.tx.length+'</strong><small>today</small></article></div>'+
      '<div class="health-columns"><section class="health-panel"><div class="health-panel-head"><div><span class="eyebrow">UNDERSTANDING</span><h2>What HudHud sees</h2></div></div>'+ins.map(x=>'<div class="health-insight"><span>'+x[0]+'</span><div><strong>'+esc(x[1])+'</strong><p>'+esc(x[2])+'</p></div></div>').join("")+'</section>'+
      '<section class="health-panel"><div class="health-panel-head"><div><span class="eyebrow">NUTRITION</span><h2>Diet log</h2></div><button class="secondary" data-health-add-meal>＋ Meal</button></div>'+(c.meals.length?c.meals.slice(0,8).map(x=>'<div class="health-row"><span>🍽️</span><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.date)+' · '+x.calories+' cal · '+x.protein+'g protein</small></div></div>').join(""):'<div class="health-empty">No meals logged yet. Start with what you actually eat.</div>')+'</section></div>'+
      '<section class="health-panel"><div class="health-panel-head"><div><span class="eyebrow">MONEY × HEALTH</span><h2>Transaction intelligence</h2><p class="muted">HudHud can categorize authorized purchases without turning your financial data into advertising.</p></div><div><button class="secondary" data-health-add-tx>＋ Transaction</button> <button class="primary" data-health-connect-finance>Connect</button></div></div>'+(c.tx.length?c.tx.slice(0,10).map(x=>'<div class="health-row"><span>💳</span><div><strong>'+esc(x.merchant)+'</strong><small>'+esc(x.date)+' · '+esc(x.category)+' · '+money(x.amount)+'</small></div></div>').join(""):'<div class="health-empty">No transactions are connected. You can add a test transaction or connect an authorized financial provider.</div>')+'</section>'+
      '<section class="health-principles"><div><span class="eyebrow">THE CORE IDEA</span><h2>HudHud doesn't just collect data. It connects context.</h2><p>Activity can explain energy needs. Meals can explain nutrition. Transactions can explain purchasing patterns. Together, authorized signals can help HudHud understand what is happening and surface patterns for you to evaluate.</p></div><div class="health-principle-grid"><span>⌚ BODY</span><span>🥗 DIET</span><span>💳 MONEY</span><span>🧠 CONTEXT</span></div></section></div>';
  }
  function bind(){
    document.querySelectorAll("[data-health-source]").forEach(b=>b.onclick=()=>{const id=b.dataset.healthSource;if(id==="apple-health")connectApple();else if(id==="financial")connectFinance();else toastHealth("Nutrition is built into HudHud Health. Use the Meal button to start.");});
    document.querySelector("[data-health-add-meal]")?.addEventListener("click",addMeal);
    document.querySelector("[data-health-add-tx]")?.addEventListener("click",addTransaction);
    document.querySelector("[data-health-connect-finance]")?.addEventListener("click",connectFinance);
  }
  window.hudhudHealthPage=page;
  window.hudhudBindHealth=bind;
  window.hudhudHealthCore={load,save,calc,insightList};
})();