import { createPool } from './db.js';
import { createApp } from './app.js';
const pool = createPool();
const port = Number(process.env.PORT ?? 3001);
const server = createApp(pool).listen(port, '127.0.0.1', () =>
  console.log(`Pauta API: http://localhost:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
