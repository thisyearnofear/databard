module.exports = {
  apps: [
    {
      name: 'databard',
      script: 'server.js',
      interpreter: 'node',
      cwd: '/opt/databard/current',
      env: {
        NODE_ENV: 'production',
        PORT: 42100,
        CORAL_GATEWAY_URL: 'http://localhost:42101/query',
        // CORAL_GATEWAY_TOKEN: 'your-secret-token', // Set this on server or via env
      },
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
      error_file: '/opt/databard/logs/error.log',
      out_file: '/opt/databard/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'coral-bridge',
      script: 'scripts/coral-bridge.mjs',
      interpreter: 'node',
      cwd: '/opt/databard/current',
      env: {
        PORT: 42101,
        PATH: "/usr/local/bin:/usr/bin:/bin:/home/deploy/.local/bin",
        // CORAL_GATEWAY_TOKEN: 'your-secret-token',
        // GITHUB_TOKEN: '...',
        // SLACK_TOKEN: '...',
      },
      error_file: '/opt/databard/logs/coral-error.log',
      out_file: '/opt/databard/logs/coral-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
