document.title="HudHud HQ";
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:"smooth"});}
function notify(message){const t=document.getElementById("toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
function launchProject(){notify("Project Launchpad initialized — project creation is the next control layer.");document.querySelector("#activityFeed")?.insertAdjacentHTML("afterbegin",'<div><i></i><span><b>HudHud</b> opened Project Launchpad</span><small>NOW</small></div>');}
document.querySelectorAll("nav a").forEach(a=>a.addEventListener("click",()=>{document.querySelectorAll("nav a").forEach(x=>x.classList.remove("active"));a.classList.add("active");}));
console.log("🦉 HUDHUD HQ ONLINE");