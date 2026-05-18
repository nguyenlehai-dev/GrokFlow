// Minimal mock of GrokFlow's /api/sdk/* surface so member modules can
// run locally without standing up the full core. Returns a fixed test
// user for any service+user token combo. Drop this folder verbatim
// into your repo if you want to keep dev offline.

const http = require("node:http");

const STUB_USER = {
  user_id: "00000000-0000-0000-0000-000000000001",
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@local.test",
  full_name: "Dev User",
  role: "super_admin",
};

const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  res.setHeader("Content-Type", "application/json");

  if (path === "/api/sdk/auth/verify") {
    res.end(JSON.stringify({ ...STUB_USER }));
    return;
  }
  if (path === "/api/sdk/users/me") {
    res.end(JSON.stringify(STUB_USER));
    return;
  }
  if (path === "/api/sdk/tenants/current") {
    res.end(JSON.stringify({ tenant_id: null, hostname: "localhost", label: "Dev tenant" }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ detail: "mock-core: route not found" }));
});

server.listen(9000, () => console.log("mock-core on :9000"));
