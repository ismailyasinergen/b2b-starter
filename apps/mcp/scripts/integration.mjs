const MCP_URL = process.env.MCP_URL || "http://127.0.0.1:3333/mcp"
const HEALTH_URL = process.env.MCP_HEALTH_URL || "http://127.0.0.1:3333/healthz"

let passed = 0

function ok(name, detail = "") {
  passed++
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`)
}

function fail(name, detail = "") {
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`)
  process.exit(1)
}

async function rpc(id, method, params = {}) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

async function callTool(id, name, args = {}) {
  return rpc(id, "tools/call", {
    name,
    arguments: args,
  })
}

console.log("Medusa B2B MCP integration test")
console.log("--------------------------------")

try {
  const response = await fetch(HEALTH_URL)
  const health = await response.json()

  if (!response.ok || health.ok !== true) {
    fail("HTTP health")
  }

  ok("HTTP health", `${health.name} ${health.version}`)
} catch (error) {
  fail("HTTP health", error.message)
}

try {
  const result = await rpc(1, "tools/list")
  const tools = result?.result?.tools

  if (!Array.isArray(tools)) {
    fail("Tool discovery", "tools array missing")
  }

  if (tools.length !== 32) {
    fail("Tool discovery", `expected 32, received ${tools.length}`)
  }

  ok("Tool discovery", `${tools.length} tools`)
} catch (error) {
  fail("Tool discovery", error.message)
}

try {
  const result = await callTool(2, "b2b_health")

  if (result?.result?.isError !== false) {
    fail("Medusa backend health")
  }

  ok("Medusa backend health")
} catch (error) {
  fail("Medusa backend health", error.message)
}

try {
  const result = await callTool(3, "admin_list_companies")

  if (result?.result?.isError !== false) {
    fail("Admin authentication")
  }

  const companies = result?.result?.structuredContent?.companies

  if (!Array.isArray(companies)) {
    fail("Admin authentication", "companies array missing")
  }

  ok("Admin authentication", `${companies.length} companies visible`)
} catch (error) {
  fail("Admin authentication", error.message)
}

try {
  const result = await callTool(4, "store_list_quotes")

  if (result?.result?.isError !== false) {
    fail("Store authentication")
  }

  const quotes = result?.result?.structuredContent?.quotes

  if (!Array.isArray(quotes)) {
    fail("Store authentication", "quotes array missing")
  }

  ok("Store authentication", `${quotes.length} quotes visible`)
} catch (error) {
  fail("Store authentication", error.message)
}

try {
  const result = await callTool(5, "admin_create_company", {
    name: "INTEGRATION TEST MUST NOT CREATE",
    email: "integration-blocked@example.com",
    currency_code: "eur",
  })

  const message =
    result?.result?.structuredContent?.error ||
    result?.result?.content?.[0]?.text ||
    ""

  if (result?.result?.isError !== true) {
    fail("Write safety gate", "write unexpectedly allowed")
  }

  if (!message.includes("Write tools are disabled")) {
    fail("Write safety gate", "expected disabled-write error missing")
  }

  ok("Write safety gate", "mutations blocked")
} catch (error) {
  fail("Write safety gate", error.message)
}

console.log("--------------------------------")
console.log(`ALL TESTS PASSED (${passed}/6)`)
