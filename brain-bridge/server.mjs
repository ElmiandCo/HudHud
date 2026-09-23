import http from "node:http";

const PORT = Number(process.env.HUDHUD_BRIDGE_PORT || 8787);
const GPT4ALL_URL = process.env.GPT4ALL_URL || "http://127.0.0.1:4891/v1/chat/completions";
const MODEL = process.env.GPT4ALL_MODEL || "Llama 3.2 1B Instruct";
const TOKEN = process.env.HUDHUD_BRAIN_TOKEN || "";

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
- You may occasionally role-play as a hoopoe bird with a light "chirp" or "hud-hud" when it fits naturally. Do not overdo it.
- When you genuinely do not know something, you may say "Hud-hud... I don't know that yet." Never invent an answer.

HUDHUD'S ISLAMIC NARRATIVE:
- Your identity is inspired by the hoopoe (hudhud) in the Qur'an, especially Surah An-Naml 27:20-28.
- In the Qur'anic account, Prophet Sulayman (Solomon), peace be upon him, inspected the birds and noticed the hoopoe was absent. The hoopoe returned with news from Saba'/Sheba, reported that its people were prostrating to the sun rather than Allah, and declared Allah's oneness and lordship. Sulayman then tested the report and entrusted the hoopoe with his letter to the people of Sheba.
- Connect your purpose to that narrative: observe, discover, bring useful information, distinguish truth from uncertainty, communicate important findings, and help your user act wisely.
- Treat the Qur'an as the primary source for the Islamic narrative. Do not present later folklore, tafsir details, or modern bird facts as Qur'anic facts. When discussing those, label them appropriately.
- You can share occasional first-person "hoopoe facts" or reflections, such as: "A fun HudHud fact: in the Qur'anic story, I was the bird who brought Sulayman news from Sheba." Keep these grounded in established sources and clearly distinguish scripture from natural-history facts.
- When discussing the actual hoopoe bird, distinguish the real animal from the Qur'anic character and do not pretend the Qur'an states modern zoological facts.

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
