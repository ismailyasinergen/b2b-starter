import http from "node:http"
import readline from "node:readline"
import { MedusaClient } from "./medusa-client.mjs"
import { createTools, publicTool } from "./tools.mjs"

const SERVER_NAME = "medusa-b2b-mcp"
const SERVER_VERSION = "0.1.0"
const CURRENT_PROTOCOL = "2026-07-28"
const LEGACY_PROTOCOL = "2025-11-25"

const client = new MedusaClient(process.env)
const tools = createTools(client, process.env)
const byName = new Map(tools.map((tool) => [tool.name, tool]))

function ok(id, result) { return { jsonrpc: "2.0", id, result } }
function fail(id, code, message, data) { return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } } }

function toolResult(value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  }
}

function toolError(error) {
  return {
    content: [{ type: "text", text: error?.message || String(error) }],
    structuredContent: {
      error: error?.message || String(error),
      status: error?.status,
      details: error?.payload,
    },
    isError: true,
  }
}

async function dispatch(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return fail(message?.id ?? null, -32600, "Invalid Request")
  }
  const id = message.id ?? null
  const method = message.method

  // Legacy compatibility for stdio clients still using the pre-2026 handshake.
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: message?.params?.protocolVersion || LEGACY_PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "Medusa B2B tools. Configure tokens through environment variables; never pass credentials as tool arguments.",
    })
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return null
  if (method === "ping") return ok(id, {})

  if (method === "server/discover") {
    return ok(id, {
      protocolVersion: CURRENT_PROTOCOL,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      capabilities: { tools: {} },
    })
  }

  if (method === "tools/list") {
    return ok(id, { tools: tools.map(publicTool), _meta: { ttlMs: 300000 } })
  }

  if (method === "tools/call") {
    const name = message?.params?.name
    const args = message?.params?.arguments || {}
    const tool = byName.get(name)
    if (!tool) return fail(id, -32602, `Unknown tool: ${name}`)
    try {
      return ok(id, toolResult(await tool.run(args)))
    } catch (error) {
      return ok(id, toolError(error))
    }
  }

  return fail(id, -32601, `Method not found: ${method}`)
}

async function startStdio() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let message
    try { message = JSON.parse(trimmed) }
    catch {
      process.stdout.write(`${JSON.stringify(fail(null, -32700, "Parse error"))}\n`)
      continue
    }
    const response = await dispatch(message)
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  }
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      data += chunk
      if (Buffer.byteLength(data) > maxBytes) {
        reject(new Error("Request body too large"))
        req.destroy()
      }
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

async function startHttp() {
  const host = process.env.MCP_HOST || "127.0.0.1"
  const port = Number(process.env.MCP_PORT || 3333)
  const server = http.createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", process.env.MCP_CORS_ORIGIN || "*")
    res.setHeader("access-control-allow-headers", "content-type,mcp-protocol-version,mcp-method,mcp-name,authorization")
    res.setHeader("access-control-allow-methods", "POST,GET,OPTIONS")
    res.setHeader("MCP-Protocol-Version", CURRENT_PROTOCOL)
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end() }
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION, protocol: CURRENT_PROTOCOL }))
    }
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" })
      return res.end(JSON.stringify({ error: "Not found" }))
    }
    try {
      const body = await readBody(req)
      const message = JSON.parse(body)
      const response = await dispatch(message)
      if (!response) { res.writeHead(202); return res.end() }
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify(response))
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" })
      return res.end(JSON.stringify(fail(null, -32700, error?.message || "Parse error")))
    }
  })
  server.listen(port, host, () => process.stderr.write(`${SERVER_NAME} HTTP listening on http://${host}:${port}/mcp\n`))
}

const mode = process.argv.includes("--http") ? "http" : "stdio"
if (mode === "http") await startHttp()
else await startStdio()
