module.exports = {
  apps: [
    {
      name: 'ertdonvq-frontend',
      cwd: '/www/wwwroot/ertdonvq.com/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'ertdonvq-mcp',
      cwd: '/www/wwwroot/ertdonvq.com/mcp-servers/facebook-mcp',
      script: '/www/wwwroot/ertdonvq.com/mcp-servers/facebook-mcp/start.sh',
      interpreter: '/bin/bash',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '256M',
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
