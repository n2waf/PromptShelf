import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { validateApiKey } from "./auth";
import { createMcpServer } from "./mcp-server";

admin.initializeApp();

export const mcp = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    if (req.method === "GET" && (req.path === "/" || req.path === "")) {
      res.json({
        name: "PromptShelf MCP Server",
        version: "1.0.0",
        status: "ok",
        transport: "streamable-http",
        endpoint: "/mcp",
      });
      return;
    }

    const authResult = await validateApiKey(req.headers.authorization);
    const uid = authResult.uid;

    if (req.method === "POST" && (req.path === "/" || req.path === "")) {
      const body = req.body;

      if (!body || typeof body !== "object") {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error: Invalid JSON" },
          id: null,
        });
        return;
      }

      const { jsonrpc, id, method, params } = body;

      if (jsonrpc !== "2.0") {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request: Must use JSON-RPC 2.0" },
          id: id || null,
        });
        return;
      }

      const server = createMcpServer(uid);

      try {
        let result: unknown;

        switch (method) {
          case "initialize":
            result = {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "promptshelf", version: "1.0.0" },
            };
            break;

          case "notifications/initialized":
            res.status(204).send("");
            return;

          case "tools/list":
            result = await server.handleListTools();
            break;

          case "tools/call":
            if (!params || typeof params !== "object" || !("name" in params)) {
              res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32602, message: "Invalid params: Missing tool name" },
                id,
              });
              return;
            }
            result = await server.handleToolCall(params.name, params.arguments || {});
            break;

          case "ping":
            result = {};
            break;

          default:
            res.status(400).json({
              jsonrpc: "2.0",
              error: { code: -32601, message: `Method not found: ${method}` },
              id,
            });
            return;
        }

        res.json({ jsonrpc: "2.0", result, id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: `Internal error: ${message}` },
          id,
        });
      }
      return;
    }

    res.status(404).json({ error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (
      message.includes("Authorization") ||
      message.includes("API key") ||
      message.includes("Invalid")
    ) {
      res.status(401).json({ error: message });
      return;
    }

    console.error("MCP Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
