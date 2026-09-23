export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  /*
   * The browser talks only to this same-origin endpoint.
   * The actual brain can later be connected server-side through
   * HUDHUD_BRAIN_URL, keeping the browser away from localhost.
   */
  const brainUrl = process.env.HUDHUD_BRAIN_URL;

  if (!brainUrl) {
    return res.status(503).json({
      error: "HudHud is online, but no server-side brain connection is configured yet."
    });
  }

  try {
    const response = await fetch(brainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.HUDHUD_BRAIN_TOKEN
          ? { Authorization: `Bearer ${process.env.HUDHUD_BRAIN_TOKEN}` }
          : {})
      },
      body: JSON.stringify({ message })
    });

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { reply: raw };
    }

    if (!response.ok) {
      return res.status(502).json({
        error: `Brain connection returned HTTP ${response.status}.`
      });
    }

    return res.status(200).json({
      reply: data.reply || data.choices?.[0]?.message?.content || ""
    });
  } catch (error) {
    return res.status(502).json({
      error: "HudHud could not reach its configured brain."
    });
  }
}
