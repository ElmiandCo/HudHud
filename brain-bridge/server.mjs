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
            content:
              "You are HudHud, a local AI assistant. Be direct, useful, concise, and honest. You are running locally through GPT4All."
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
