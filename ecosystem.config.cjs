module.exports = {
  apps: [{
    name: 'databard',
    script: '.next/standalone/server.js',
    interpreter: 'node',
    cwd: '/opt/databard',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
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
  }]
};
