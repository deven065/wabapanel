module.exports = {
  apps: [
    {
      name: 'wabapanel-api',
      script: '/var/www/wabapanel-express/src/server.js',
      cwd: '/var/www/wabapanel-express',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        MONGODB_URI: 'mongodb://localhost:27017/wabapanel'
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000
    },
    {
      name: 'wabapanel-app',
      script: '/var/www/wabapanel-frontend/start.sh',
      cwd: '/var/www/wabapanel-frontend',
      interpreter: '/bin/bash',
      env: {
        PORT: 3002
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000
    }
  ]
};
