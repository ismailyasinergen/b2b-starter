import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { startMockMedusa } from "./mock-medusa.mjs"

const mockPort = 19000
const mock = await startMockMedusa(mockPort)
const child = spawn(process.execPath, ["src/server.mjs", "--stdio"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    MEDUSA_BACKEND_URL: `http://127.0.0.1:${mockPort}`,
    MEDUSA_PUBLISHABLE_KEY: "pk_test",
    MEDUSA_STORE_TOKEN: "customer_test",
    MEDUSA_ADMIN_TOKEN: "admin_test",
    MCP_ALLOW_WRITES: "true",
  },
  stdio: ["pipe", "pipe", "pipe"],
})

let buffer = ""
const pending = []
child.stdout.setEncoding("utf8")
child.stdout.on("data", (chunk) => {
  buffer += chunk
  while (buffer.includes("\n")) {
    const idx = buffer.indexOf("\n")
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    const resolve = pending.shift()
    if (resolve) resolve(JSON.parse(line))
  }
})

function rpc(message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC timeout: ${message.method}`)), 3000)
    pending.push((value) => { clearTimeout(timer); resolve(value) })
    child.stdin.write(`${JSON.stringify(message)}\n`)
  })
}

try {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } })
  if (!init.result?.capabilities?.tools) throw new Error("initialize missing tools capability")

  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  if (!Array.isArray(list.result?.tools) || list.result.tools.length < 20) throw new Error("too few MCP tools")

  const health = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "b2b_health", arguments: {} } })
  if (health.result?.isError || health.result?.structuredContent?.status !== "ok") throw new Error("health tool failed")

  const quotes = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "store_list_quotes", arguments: {} } })
  if (quotes.result?.structuredContent?.quotes?.[0]?.id !== "quote_test") throw new Error("quote mapping failed")

  const bulk = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "store_bulk_add_to_cart", arguments: { cart_id: "cart_test", line_items: [{ variant_id: "variant_test", quantity: 3 }] } } })
  if (bulk.result?.structuredContent?.cart?.items?.[0]?.quantity !== 3) throw new Error("bulk-cart write mapping failed")

  console.log(JSON.stringify({ ok: true, tool_count: list.result.tools.length, tested: ["initialize", "tools/list", "b2b_health", "store_list_quotes", "store_bulk_add_to_cart"] }, null, 2))
} finally {
  child.kill("SIGTERM")
  await new Promise((resolve) => mock.close(resolve))
}
