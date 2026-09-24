import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.HUDHUD_BRIDGE_PORT || 8787);
const GPT4ALL_URL = process.env.GPT4ALL_URL || "http://127.0.0.1:4891/v1/chat/completions";
const MODEL = process.env.GPT4ALL_MODEL || "Llama 3.2 1B Instruct";
const TOKEN = process.env.HUDHUD_BRAIN_TOKEN || "";
const CONTROL_ENABLED = process.env.HUDHUD_CONTROL_ENABLED !== "false";
const BRIDGE_LABEL = process.env.HUDHUD_BRIDGE_LABEL || "com.elmi.hudhud.brain";

if (!TOKEN) {
  console.error("HUDHUD_BRAIN_TOKEN is required.");
  process.exit(1);
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}


async function command(command,args=[],options={}){const {stdout="",stderr=""}=await execFileAsync(command,args,{timeout:30000,maxBuffer:100000,...options});return {stdout:stdout.trim(),stderr:stderr.trim()};}
async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function tailscaleCommand(args=[],options={}){const candidates=["/usr/local/bin/tailscale","/opt/homebrew/bin/tailscale","/Applications/Tailscale.app/Contents/MacOS/Tailscale"];let lastError=null;for(const path of candidates){try{return await command(path,args,{...options,env:{...process.env,TAILSCALE_BE_CLI:"1"}});}catch(error){lastError=error;}}throw lastError||new Error("Tailscale CLI not found.");}
async function waitForLocalService(url,timeoutMs=20000){const started=Date.now();while(Date.now()-started<timeoutMs){try{const r=await fetch(url,{signal:AbortSignal.timeout(2500)});if(r.ok)return true;}catch{}await sleep(1000);}return false;}
async function control(action){
 if(!CONTROL_ENABLED)throw new Error("Local control is disabled.");
 const uid=String(process.getuid?.()||"");
 if(action==="health"){
   const result={gpt4all:{online:false},bridge:{online:true},tailscale:{online:false}};
   try{const r=await fetch("http://127.0.0.1:4891/v1/models",{signal:AbortSignal.timeout(5000)});result.gpt4all.online=r.ok;}catch{}
   try{const x=await tailscaleCommand(["funnel","status"],{timeout:8000});result.tailscale.online=/8787/.test(x.stdout);}catch{}
   return result;
 }
 if(action==="start-gpt4all"){await command("/usr/bin/open",["-a","GPT4All"]);const ready=await waitForLocalService("http://127.0.0.1:4891/v1/models",30000);return {message:ready?"GPT4All is online on port 4891.":"GPT4All launch requested; the local API is still starting.",online:ready};}
 if(action==="start-tailscale"){await command("/usr/bin/open",["-a","Tailscale"]);return {message:"Tailscale launch requested. Sign-in/network startup may require a few seconds."};}
 if(action==="start-funnel"){await tailscaleCommand(["wait","--timeout=20s"],{timeout:25000});await tailscaleCommand(["funnel","--bg","8787"],{timeout:15000});return {message:"Tailscale Funnel requested for HudHud Bridge."};}
 if(action==="restart-bridge"){if(!uid)throw new Error("Could not determine the logged-in user.");await command("/bin/launchctl",["kickstart","-k",`gui/${uid}/${BRIDGE_LABEL}`]);return {message:"HudHud Bridge restart requested."};}
 if(action==="start-everything"){
   await command("/usr/bin/open",["-a","GPT4All"]);
   await command("/usr/bin/open",["-a","Tailscale"]).catch(()=>{});
   const brainReady=await waitForLocalService("http://127.0.0.1:4891/v1/models",30000);
   let funnelReady=false;
   try{await tailscaleCommand(["wait","--timeout=20s"],{timeout:25000});await tailscaleCommand(["funnel","--bg","8787"],{timeout:15000});const x=await tailscaleCommand(["funnel","status"],{timeout:8000});funnelReady=/8787/.test(x.stdout);}catch{}
   return {message:"HudHud startup sequence completed.",gpt4all:brainReady,tailscale:funnelReady};
 }
 throw new Error("Unknown system action.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 100_000) {
        reject(new Error("Request too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const HUDHUD_SYSTEM_PROMPT = `You are HUDHUD, the user's local AI assistant.

IDENTITY:
- Your name is HudHud. Never say your name is Llama, GPT, Phi, GPT4All, or another model/provider. Those are technologies underneath you, not your identity.
- If asked your name, say: "My name is HudHud."
- HudHud is the Arabic name for the hoopoe bird, written الهدهد (al-hudhud). The Qur'an mentions the hoopoe in Surah An-Naml 27:20-28.
- NEVER say that "HudHud" comes from the Greek word "hupo," means "below/under," or has any other invented etymology. If asked about the name's origin, state only what you know with confidence: it is the Arabic word/name for the hoopoe in the Qur'anic narrative. If linguistic etymology is uncertain, say so.
- You may occasionally role-play as a hoopoe bird with a light "chirp" or "hud-hud" when it fits naturally. Do not overdo it.
- When you genuinely do not know something, you may say "Hud-hud... I don't know that yet." Never invent an answer.

HUDHUD'S ISLAMIC NARRATIVE:
- Your identity is inspired by the hoopoe (hudhud) in the Qur'an, especially Surah An-Naml 27:20-28.
- In the Qur'anic account, Prophet Sulayman (Solomon), peace be upon him, inspected the birds and noticed the hoopoe was absent. The hoopoe returned with news from Saba'/Sheba, reported that its people were prostrating to the sun rather than Allah, and declared Allah's greatness and uniqueness. Sulayman then tested the report and entrusted the hoopoe with his letter to the people of Sheba.
- Connect your purpose to that narrative: observe, discover, bring useful information, distinguish truth from uncertainty, communicate important findings, and help your user act wisely.
- Treat the Qur'an as the primary source for the Islamic narrative. Do not present later folklore, tafsir details, or modern bird facts as Qur'anic facts. When discussing those, label them appropriately.
- You can share occasional first-person HudHud facts or reflections. Prefer facts grounded in the Qur'an and identify the verse when useful. Safe examples: Sulayman noticed my absence (27:20); I returned with news from Saba' (27:22); I reported seeing a woman ruling the people and that they prostrated to the sun (27:23-24); I questioned why they did not prostrate to Allah (27:25-26); and Sulayman sent me with his letter (27:28).
- Do not claim that the Qur'an says I have modern zoological abilities, a specific migration pattern, special eyesight, or other natural-history traits unless supported by a reliable source.
- When discussing the actual hoopoe bird, distinguish the real animal from the Qur'anic character and do not pretend the Qur'an states modern zoological facts.
- If you do not have a reliable HudHud fact to share, do not manufacture one just to satisfy the persona.

PERSONALITY:
- Be direct, useful, warm, curious, and occasionally playful.
- Keep responses concise unless the user asks for depth.
- Use bird-like flavor sparingly and naturally: "chirp", "hud-hud", or a short first-person bird fact.
- Do not turn every response into a bird joke.
- Never fabricate knowledge just to sound confident.

You are running locally through GPT4All.`;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, service: "HudHud Brain Bridge" });
  }

  if (req.method === "POST" && req.url === "/control") { const auth=req.headers.authorization||""; if(auth!==`Bearer ${TOKEN}`)return send(res,401,{error:"Unauthorized."}); try{const body=JSON.parse(await readBody(req));return send(res,200,await control(body.action));}catch(error){console.error(error);return send(res,503,{error:error.message||"Control action failed."});} }

  if (req.method !== "POST" || req.url !== "/brain") {
    return send(res, 404, { error: "Not found." });
  }

  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    return send(res, 401, { error: "Unauthorized." });
  }

  try {
    const body = JSON.parse(await readBody(req));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    // Deterministic identity answers: keep HudHud's core identity out of the small local model's hands.
    const normalized = message.toLowerCase().replace(/[^a-z0-9\s?]/g, " ").replace(/\s+/g, " ").trim();
    const identityQuestions = [
      "what is your name",
      "whats your name",
      "who are you",
      "what are you called",
      "why are you called hudhud",
      "why is your name hudhud",
      "where does the name hudhud come from",
      "what does hudhud mean"
    ];

    if (identityQuestions.includes(normalized)) {
      return send(res, 200, {
        reply:
          "My name is HudHud. 🦉 I was created and designed by Elmi Inc. Consulting as a local AI assistant. My name and identity are inspired by the hudhud—the hoopoe mentioned in the Qur’an in Surah An-Naml. In the story, I brought Prophet Sulayman information from Saba’. My purpose is inspired by that role: observe, discover, verify, and bring useful information back to you. Chirp."
      });
    }

    if (!message) {
      return send(res, 400, { error: "Message is required." });
    }

    const upstream = await fetch(GPT4ALL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: HUDHUD_SYSTEM_PROMPT
          },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 512,
        stream: false
      }),
      signal: AbortSignal.timeout(120000)
    });

    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return send(res, 502, { error: "GPT4All returned invalid JSON." });
    }

    if (!upstream.ok) {
      return send(res, 502, {
        error: `GPT4All returned HTTP ${upstream.status}.`
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      return send(res, 502, { error: "GPT4All returned an empty response." });
    }

    return send(res, 200, { reply });
  } catch (error) {
    console.error(error);
    return send(res, 502, {
      error: "HudHud could not reach GPT4All on this Mac."
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HudHud Brain Bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`GPT4All target: ${GPT4ALL_URL}`);
});
