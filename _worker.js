// _worker.js – Zoom Phone Recording Explorer backend - nearly ready for deployment. 

const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";

/**
 * Simple in-memory cache (per running isolate) so we’re not
 * calling OAuth every single request. CF will spin new isolates,
 * but this still reduces churn.
 */
let cachedToken = null;
let cachedTokenExp = 0; // epoch ms

async function getZoomAccessToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExp - 30_000) {
    return cachedToken;
  }

  async function handleGetMeetingRecordings(req, env) {
  try {
    const url = new URL(req.url);

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pageSize = url.searchParams.get("page_size") || "30";
    const nextToken = url.searchParams.get("next_page_token") || "";

    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page_size", pageSize);
    if (nextToken) params.set("next_page_token", nextToken);

    // You can tune these if you want, but these are nice defaults:
    params.set("mc", "false");
    params.set("trash", "false");
    // params.set("trash_type", "meeting_recordings"); // optional

    // 🔐 IMPORTANT: use the SAME token logic you use for phone recordings
    // If your phone handler does: const token = await getZoomAccessToken(env);
    // then this line is correct:
    const token = await getZoomAccessToken(env);

    // Decide which user to pull recordings for
    // - You can set ZOOM_MEETINGS_USER_ID in wrangler.toml / dashboard
    // - Or omit it and default to "me" (the user tied to the token)
    const userId = env.ZOOM_MEETINGS_USER_ID || "me";

    const zoomUrl = `https://api.zoom.us/v2/users/${encodeURIComponent(
      userId
    )}/recordings?${params.toString()}`;

    const zoomRes = await fetch(zoomUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await zoomRes.text();

    return new Response(text, {
      status: zoomRes.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Meeting recordings error", err);
    return new Response(
      JSON.stringify({
        error: "Meeting recordings handler failed",
        message: (err && err.message) || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


  const basicAuth = btoa(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`);
  const url = new URL(ZOOM_OAUTH_TOKEN_URL);
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", env.ZOOM_ACCOUNT_ID);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get Zoom token (${res.status}): ${text}`);
  }

  const data = await res.json();
  // Response has access_token + expires_in (seconds)
  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function handleGetRecordings(req, env) {
  const url = new URL(req.url);
  const upstreamUrl = new URL(`${ZOOM_API_BASE}/phone/recordings`);

  // Pass through supported query params (safe default: just forward everything)
  for (const [key, value] of url.searchParams.entries()) {
    upstreamUrl.searchParams.set(key, value);
  }

  const token = await getZoomAccessToken(env);

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  const text = await upstreamRes.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return new Response(JSON.stringify(body), {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" // tweak if you want stricter
    }
  });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function handleDownloadRecording(req, env) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response(
      JSON.stringify({ error: "Missing 'url' query parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let zoomUrl;
  try {
    zoomUrl = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Basic safety: only allow zoom.us phone recording downloads
  if (
    zoomUrl.hostname !== "zoom.us" ||
    !zoomUrl.pathname.startsWith("/v2/phone/recording/download")
  ) {
    return new Response(JSON.stringify({ error: "Blocked URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Reuse whatever you use for the recordings list
  const accessToken = await getZoomAccessToken(env); // <-- use your existing helper

  const zoomRes = await fetch(zoomUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Stream back the file
  const headers = new Headers();
  const ct = zoomRes.headers.get("content-type");
  const cd = zoomRes.headers.get("content-disposition");

  if (ct) headers.set("Content-Type", ct);
  if (cd) headers.set("Content-Disposition", cd);

  return new Response(zoomRes.body, {
    status: zoomRes.status,
    headers,
  });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ---- Phone recordings list ----
    if (url.pathname === "/api/phone/recordings" && req.method === "GET") {
      // This is your existing handler that already works
      return handleGetRecordings(req, env);
    }

    // ---- Phone recording download proxy (optional) ----
    if (
      url.pathname === "/api/phone/recordings/download" &&
      req.method === "GET"
    ) {
      // Only keep this if you added handleDownloadRecording
      return handleDownloadRecording(req, env);
    }

    // ---- Meeting recordings list (new) ----
    if (url.pathname === "/api/meeting/recordings" && req.method === "GET") {
      return handleGetMeetingRecordings(req, env);
    }

    // If your React app is served from the same Worker (it is),
    // you don't strictly need CORS/OPTIONS handlers here.
    // You can add them later if you expose these APIs cross-origin.

    // ---- Static assets / front-end ----
    if (env.ASSETS) {
      // R2 / Pages / assets binding created by wrangler
      return env.ASSETS.fetch(req);
    }

    // Default: simple health check
    return new Response("Recording Explorer backend", { status: 200 });
  },
};



