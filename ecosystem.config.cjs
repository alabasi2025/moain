module.exports = {
  apps: [
    {
      name: 'edaat',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=edaat-db --r2=edaat-media --ip 0.0.0.0 --port 3000',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
