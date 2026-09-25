import crypto from "node:crypto";

const PROVIDERS = {
  instagram: {
    label: "Instagram",
    envId: "INSTAGRAM_CLIENT_ID",
    envSecret: "INSTAGRAM_CLIENT_SECRET",
    scopes: ["instagram_business_basic"],
    authUrl: "https://www.instagram.com/oauth/authorize",
    redirectPath: "/api/social-callback-instagram",
  },
  x: {
    label: "X",
    envId: "X_CLIENT_ID",
    envSecret: "X_CLIENT_SECRET",
    scopes: ["tweet.read", "users.read", "offline.access"],
    authUrl: "https://twitter.com/i/oauth2/authorize",
    redirectPath: "/api/social-callback-x",
    pkce: true,
  },
  tiktok: {
    label: "TikTok",
    envId: "TIKTOK_CLIENT_KEY",
    envSecret: "TIKTOK_CLIENT_SECRET",
    scopes: ["user.info.basic"],
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    redirectPath: "/api/social-callback-tiktok",
  },
  linkedin: {
    label: "LinkedIn",
    envId: "LINKEDIN_CLIENT_ID",
    envSecret: "LINKEDIN_CLIENT_SECRET",
    scopes: ["openid", "profile", "email"],
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    redirectPath: "/api/social-callback-linkedin",
  },
};

function baseUrl(req) {
  const configured = String(process.env.HUDHUD_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) throw new Error("HUDHUD_PUBLIC_URL is required when the request host is unavailable.");
  return proto + "://" + host;
}

export function providerConfig(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error("Unsupported social provider.");
  return cfg;
}

export function redirectUri(req, provider) {
  return baseUrl(req) + providerConfig(provider).redirectPath;
}

export function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function pkceVerifier() {
  return randomUrlSafe(48).slice(0, 64);
}

export function pkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function stateSecret() {
  const secret = String(process.env.HUDHUD_OAUTH_STATE_SECRET || "");
  if (!secret) throw new Error("HUDHUD_OAUTH_STATE_SECRET is not configured.");
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

function encodePayload(payload) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return raw + "." + sign(raw);
}

function decodePayload(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 2) throw new Error("OAuth state is invalid.");
  const expected = sign(parts[0]);
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("OAuth state signature is invalid.");
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!payload?.user_id || !payload?.provider || !payload?.state || !payload?.iat) throw new Error("OAuth state payload is invalid.");
  if (Date.now() - Number(payload.iat) > 10 * 60 * 1000) throw new Error("OAuth authorization expired. Please try again.");
  return payload;
}

export function setStateCookie(res, payload) {
  const value = encodePayload(payload);
  res.setHeader("Set-Cookie", "hudhud_oauth_state=" + value + "; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax");
}

export function clearStateCookie(res) {
  res.setHeader("Set-Cookie", "hudhud_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
}

export function readStateCookie(req) {
  const raw = String(req.headers.cookie || "");
  const match = raw.split(";").map(x => x.trim()).find(x => x.startsWith("hudhud_oauth_state="));
  if (!match) throw new Error("OAuth session state is missing or expired.");
  return decodePayload(match.slice("hudhud_oauth_state=".length));
}

export function buildAuthorizeUrl(req, provider, userId) {
  const cfg = providerConfig(provider);
  const clientId = String(process.env[cfg.envId] || "").trim();
  if (!clientId) throw new Error(cfg.envId + " is not configured.");
  const state = randomUrlSafe(32);
  const payload = { user_id: userId, provider, state, iat: Date.now() };
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(req, provider),
    scope: cfg.scopes.join(provider === "tiktok" ? "," : " "),
    state,
  });
  if (provider === "instagram") params.set("enable_fb_login", "0");
  if (provider === "x") {
    const verifier = pkceVerifier();
    payload.code_verifier = verifier;
    params.set("code_challenge", pkceChallenge(verifier));
    params.set("code_challenge_method", "S256");
  }
  if (provider === "linkedin") params.set("nonce", randomUrlSafe(24));
  return { url: cfg.authUrl + "?" + params.toString(), statePayload: payload };
}

function requireSecret(provider) {
  const cfg = providerConfig(provider);
  const secret = String(process.env[cfg.envSecret] || "").trim();
  if (!secret) throw new Error(cfg.envSecret + " is not configured.");
  return secret;
}

async function formPost(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const detail = data.error_description || data.detail || data.error || data.message || raw;
    throw new Error("OAuth token exchange failed: " + detail);
  }
  return data;
}

async function bearerGet(url, token) {
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const detail = data.error_description || data.detail || data.error || data.message || raw;
    throw new Error("Provider profile request failed: " + detail);
  }
  return data;
}

export async function exchangeCode(req, provider, code, statePayload) {
  const cfg = providerConfig(provider);
  const clientId = String(process.env[cfg.envId] || "").trim();
  const secret = requireSecret(provider);
  const redirect = redirectUri(req, provider);
  let token;

  if (provider === "instagram") {
    token = await formPost("https://api.instagram.com/oauth/access_token", {
      client_id: clientId,
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: redirect,
      code,
    });
    const long = await bearerGet(
      "https://graph.instagram.com/access_token?" + new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: secret,
        access_token: token.access_token,
      }).toString(),
      token.access_token
    );
    token = { ...token, ...long, access_token: long.access_token || token.access_token };
  } else if (provider === "tiktok") {
    token = await formPost("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: clientId,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    });
  } else if (provider === "x") {
    const headers = {};
    if (secret) headers.Authorization = "Basic " + Buffer.from(clientId + ":" + secret).toString("base64");
    token = await formPost("https://api.twitter.com/2/oauth2/token", {
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirect,
      code_verifier: statePayload.code_verifier,
    }, headers);
  } else if (provider === "linkedin") {
    token = await formPost("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: secret,
      redirect_uri: redirect,
    });
  }
  return token;
}

export async function fetchProfile(provider, accessToken) {
  if (provider === "instagram") {
    return bearerGet("https://graph.instagram.com/me?fields=user_id,username&access_token=" + encodeURIComponent(accessToken), accessToken);
  }
  if (provider === "tiktok") {
    const data = await bearerGet("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", accessToken);
    return data.data?.user || {};
  }
  if (provider === "x") {
    const data = await bearerGet("https://api.twitter.com/2/users/me?user.fields=profile_image_url,description", accessToken);
    return data.data || {};
  }
  if (provider === "linkedin") {
    return bearerGet("https://api.linkedin.com/v2/userinfo", accessToken);
  }
  throw new Error("Unsupported social provider.");
}

function encryptionKey() {
  const raw = String(process.env.HUDHUD_OAUTH_ENCRYPTION_KEY || "");
  if (!raw) throw new Error("HUDHUD_OAUTH_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("HUDHUD_OAUTH_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  return key;
}

export function encryptSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function normalizeProfile(provider, profile) {
  if (provider === "instagram") {
    return {
      providerAccountId: profile.user_id,
      displayName: profile.username ? "@" + profile.username : "Instagram account",
      accountHandle: profile.username || null,
      profileUrl: profile.username ? "https://www.instagram.com/" + profile.username : null,
      avatarUrl: null,
    };
  }
  if (provider === "tiktok") {
    return {
      providerAccountId: profile.open_id,
      displayName: profile.display_name || "TikTok account",
      accountHandle: profile.username || null,
      profileUrl: profile.profile_deep_link || (profile.username ? "https://www.tiktok.com/@" + profile.username : null),
      avatarUrl: profile.avatar_url || null,
    };
  }
  if (provider === "x") {
    return {
      providerAccountId: profile.id,
      displayName: profile.name || "X account",
      accountHandle: profile.username || null,
      profileUrl: profile.username ? "https://x.com/" + profile.username : null,
      avatarUrl: profile.profile_image_url || null,
    };
  }
  if (provider === "linkedin") {
    return {
      providerAccountId: profile.sub,
      displayName: profile.name || "LinkedIn account",
      accountHandle: null,
      profileUrl: null,
      avatarUrl: profile.picture || null,
    };
  }
  throw new Error("Unsupported social provider.");
}

export async function saveOAuthConnection(userId, provider, token, profile, req) {
  const normalized = normalizeProfile(provider, profile);
  if (!normalized.providerAccountId) throw new Error("Provider did not return a stable account identifier.");

  const access = encryptSecret(token.access_token);
  const refresh = encryptSecret(token.refresh_token);
  const expiresIn = Number(token.expires_in || 0);
  const refreshExpiresIn = Number(token.refresh_expires_in || 0);
  const accessExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const refreshExpiresAt = refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null;
  const scopes = typeof token.scope === "string"
    ? token.scope.split(/[ ,]+/).filter(Boolean)
    : providerConfig(provider).scopes;

  const url = String(process.env.HUDHUD_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.HUDHUD_SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");

  const headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const base = url + "/rest/v1";

  const existingResponse = await fetch(base + "/hudhud_oauth_tokens?select=id&user_id=eq." + encodeURIComponent(userId) + "&provider=eq." + encodeURIComponent(provider) + "&provider_account_id=eq." + encodeURIComponent(normalized.providerAccountId), { headers });
  const existing = await existingResponse.json();
  if (!existingResponse.ok) throw new Error("Could not inspect existing OAuth token.");

  const tokenRow = {
    user_id: userId,
    provider,
    provider_account_id: normalized.providerAccountId,
    access_token_ciphertext: access.ciphertext,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    refresh_token_ciphertext: refresh?.ciphertext || null,
    refresh_token_iv: refresh?.iv || null,
    refresh_token_tag: refresh?.tag || null,
    token_type: token.token_type || "Bearer",
    scopes,
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
    metadata: { provider: providerConfig(provider).label },
    updated_at: new Date().toISOString(),
  };

  const tokenUrl = base + "/hudhud_oauth_tokens" + (existing?.[0]?.id ? "?id=eq." + encodeURIComponent(existing[0].id) : "");
  const tokenResponse = await fetch(tokenUrl, {
    method: existing?.[0]?.id ? "PATCH" : "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(tokenRow),
  });
  if (!tokenResponse.ok) throw new Error("Could not securely store OAuth credentials.");

  const integrationQuery = base + "/hudhud_integrations?user_id=eq." + encodeURIComponent(userId) + "&provider=eq." + encodeURIComponent(provider);
  const integrationResponse = await fetch(integrationQuery, { headers });
  const integrations = await integrationResponse.json();
  if (!integrationResponse.ok) throw new Error("Could not inspect integration registry.");

  const integrationRow = {
    user_id: userId,
    provider,
    category: "social",
    status: "connected",
    provider_account_id: normalized.providerAccountId,
    display_name: normalized.displayName,
    account_handle: normalized.accountHandle,
    scopes,
    capabilities: { profile_read: true, public_content_read: provider !== "linkedin" },
    metadata: { profile_url: normalized.profileUrl, avatar_url: normalized.avatarUrl },
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    expires_at: accessExpiresAt,
    disconnected_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const existingIntegration = integrations?.[0];
  const integrationUrl = base + "/hudhud_integrations" + (existingIntegration?.id ? "?id=eq." + encodeURIComponent(existingIntegration.id) : "");
  const ir = await fetch(integrationUrl, {
    method: existingIntegration?.id ? "PATCH" : "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(integrationRow),
  });
  if (!ir.ok) {
    const detail = await ir.text();
    throw new Error("Could not update integration registry: " + detail);
  }

  return normalized;
}

export function callbackRedirect(req, provider, status, message = "") {
  const url = new URL("/", baseUrl(req));
  url.searchParams.set("social", status);
  url.searchParams.set("provider", provider);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url.toString();
}

export { PROVIDERS };
