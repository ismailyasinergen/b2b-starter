import http from "node:http"

export function startMockMedusa(port = 19000) {
  const server = http.createServer(async (req, res) => {
    let raw = ""
    for await (const chunk of req) raw += chunk
    let body = null
    if (raw) { try { body = JSON.parse(raw) } catch {} }
    res.setHeader("content-type", "application/json")

    if (req.url === "/health" && req.method === "GET") return res.end(JSON.stringify({ status: "ok" }))
    if (req.url?.startsWith("/store/quotes") && req.method === "GET") {
      return res.end(JSON.stringify({ quotes: [{ id: "quote_test", status: "pending" }], count: 1, offset: 0, limit: 15 }))
    }
    if (req.url?.startsWith("/store/carts/cart_test/line-items/bulk") && req.method === "POST") {
      return res.end(JSON.stringify({ cart: { id: "cart_test", items: body?.line_items || [] } }))
    }
    res.statusCode = 404
    return res.end(JSON.stringify({ message: `mock route not found: ${req.method} ${req.url}` }))
  })
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)))
}
