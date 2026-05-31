# Coral Production Deployment Guide

Since Coral is a local-first SQL engine that joins data across APIs and files, deploying it in a production environment (like Vercel or AWS) requires a specific architecture.

## 1. The Sidecar Pattern (Recommended for Docker/K8s)

If you are deploying via Docker (e.g., Fly.io, Railway, AWS App Runner), you can install the Coral binary directly into your container.

### Dockerfile snippet
```dockerfile
# Install Coral binary
RUN curl -fsSL https://withcoral.com/install.sh | sh

# Set the configuration directory
ENV CORAL_CONFIG_DIR=/app/coral_config
COPY ./coral_config $CORAL_CONFIG_DIR

# Your app will now have access to 'coral' in its PATH
CMD ["npm", "start"]
```

## 2. The Gateway Pattern (Recommended for Vercel/Serverless)

Serverless environments like Vercel do not allow you to run persistent background binaries or install custom CLI tools easily. In this case, use the **Gateway Pattern**:

1.  **Deploy Coral on a VPS**: Run a small instance (DigitalOcean, Hetzner) where you install Coral.
2.  **Expose a Query API**: Create a tiny Node/Python wrapper that accepts a SQL query, runs `coral sql --output json`, and returns the result.
3.  **Set Environment Variable**: In your DataBard Vercel settings, set `CORAL_GATEWAY_URL=https://your-coral-vps.com/query`.

## 3. The PM2 Pattern (Recommended for VPS/Hetzner)

If you prefer not to use Docker, you can run Coral alongside your Next.js app using **PM2**. This is ideal for space-constrained environments like Hetzner.

### 1. Install Coral on the host
```bash
curl -fsSL https://withcoral.com/install.sh | sh
```

### 2. Create a PM2 ecosystem file
Create `ecosystem.config.cjs` (or update your existing one) to run the Coral MCP server as a background process.

```javascript
module.exports = {
  apps: [
    {
      name: "databard-app",
      script: "npm start",
      env: {
        CORAL_GATEWAY_URL: "http://localhost:3001/query",
        CORAL_GATEWAY_TOKEN: "your-secret-token"
      }
    },
    {
      name: "coral-runtime",
      // We use a small node wrapper to expose Coral's stdio/mcp over HTTP
      script: "scripts/coral-bridge.mjs",
      env: {
        PORT: 3001,
        CORAL_CONFIG_DIR: "/home/user/.coral",
        CORAL_GATEWAY_TOKEN: "your-secret-token",
        GITHUB_TOKEN: "...",
        SLACK_TOKEN: "..."
      }
    }
  ]
};
```

### 3. Setup the Bridge
Since the DataBard adapter expects an HTTP endpoint or a CLI call, a tiny bridge script (`scripts/coral-bridge.mjs`) allows PM2 to manage the Coral lifecycle while exposing it to your app locally.

## 4. Configuration via Files (No-CLI setup)

In production, you don't run `coral source add --interactive`. Instead, you pre-configure your sources in a `config.toml` file inside your `CORAL_CONFIG_DIR`.

### Example `coral_config/config.toml`
```toml
[sources.github]
workspace = "default"
type = "bundled"

[sources.my_local_data]
workspace = "default"
type = "custom"
manifest_path = "workspaces/default/sources/my_local_data/manifest.yaml"
```

## 4. Providing Secrets

Coral automatically reads environment variables for source credentials. In production, simply set these in your hosting provider's dashboard:

- `GITHUB_TOKEN=...`
- `SLACK_TOKEN=...`
- `STRIPE_API_KEY=...`

## 5. Custom Binary Path

The adapter uses `execFile` (no shell interpolation) and respects the `CORAL_BIN` environment variable to override the default `coral` binary path:

```env
CORAL_BIN=/usr/local/bin/coral
```

This is useful when Coral is installed in a non-standard location or when running multiple versions side by side.

## 6. Security Note

When using the **Gateway Pattern**, ensure your query endpoint is protected by an API key (e.g., `X-Coral-Auth`) so only your DataBard instance can execute queries against your Coral runtime.
