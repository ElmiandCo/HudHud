# HudHud Brain Bridge

This local bridge connects the public HudHud HQ site to GPT4All running on the Mac.

Architecture:

```
Any device
  -> HudHud HQ on Vercel
  -> /api/hudhud
  -> Tailscale Funnel
  -> this bridge on the Mac
  -> GPT4All at 127.0.0.1:4891
```

## 1. Start the bridge

From this folder:

```bash
export HUDHUD_BRAIN_TOKEN='CREATE-A-LONG-RANDOM-TOKEN'
node server.mjs
```

Keep this terminal running.

Test locally:

```bash
curl http://127.0.0.1:8787/health
```

## 2. Expose only the bridge with Tailscale Funnel

With Tailscale installed and Funnel enabled:

```tailscale funnel --bg 8787```

Then:

```bash
tailscale funnel status
```

Copy the HTTPS `*.ts.net` URL.

The bridge endpoint HudHud needs is:

```
https://YOUR-HUDHUD-MAC.ts.net/brain
```

## 3. Configure Vercel

Set these production environment variables on the HudHud Vercel project:

- `HUDHUD_BRAIN_URL` = `https://YOUR-HUDHUD-MAC.ts.net/brain`
- `HUDHUD_BRAIN_TOKEN` = the exact same token used by the bridge

Then redeploy.

## Important

The Mac must remain powered on, connected to the internet, GPT4All must be running, and the bridge must be running for HudHud's local brain to answer.

Do not expose GPT4All port 4891 directly. Only expose the authenticated bridge.
