export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      try {
        const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name").all();
        return Response.json({
          ok: true,
          service: "Chess Network API",
          database: "connected",
          tables: (result.results || []).map(row => row.name),
          note: "Migration foundation is deployed; application endpoints are not yet enabled."
        }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ ok: false, database: "error" }, { status: 503 });
      }
    }
    return Response.json({ error: "Not found", service: "Chess Network API" }, { status: 404 });
  }
};