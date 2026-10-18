const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" || url.pathname === "/health") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name"
        ).all();

        return json({
          ok: true,
          service: "Chess Network API",
          database: "connected",
          tables: (result.results || []).map(row => row.name),
          migrationStatus: "foundation",
          note: "Static asset and D1 foundation only. Authentication and game APIs must be migrated before launch."
        });
      } catch {
        return json({ ok: false, service: "Chess Network API", database: "unavailable" }, 503);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "This endpoint has not been migrated from Hatchable yet.",
        endpoint: url.pathname
      }, 501);
    }

    // Cloudflare Workers Static Assets handles the public/ files.
    return env.ASSETS.fetch(request);
  }
};
