/**
 * Coral HTTP Bridge
 * Exposes the local 'coral' CLI as an internal HTTP service for PM2/Hetzner.
 * This avoids the overhead of Docker while keeping Coral isolated.
 */
import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const PORT = process.env.PORT || 3001;
const TOKEN = process.env.CORAL_GATEWAY_TOKEN;

const server = createServer(async (req, res) => {
  // Simple auth check
  if (TOKEN && req.headers["x-coral-auth"] !== TOKEN) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  if (req.method === "POST" && req.url === "/query") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { query } = JSON.parse(body);
        if (!query) throw new Error("Query required");

        // Execute via local CLI
        const { stdout } = await execAsync(`coral sql --format json "${query.replace(/"/g, '\\"')}"`);
        
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ results: JSON.parse(stdout) }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`⚓ Coral Bridge running on http://localhost:${PORT}`);
});
