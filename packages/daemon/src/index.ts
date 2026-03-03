import path from 'node:path';
import { createServer } from './server.js';

const PORT = parseInt(process.env.MERRY_PORT ?? '3141', 10);
// When run from packages/daemon, resolve up to monorepo root
const ROOT_DIR = process.env.MERRY_ROOT ?? path.resolve(import.meta.dirname, '../../..');

const config = {
  port: PORT,
  agentsDir: path.resolve(ROOT_DIR, 'agents'),
  dataDir: path.resolve(ROOT_DIR, 'data'),
  corsOrigins: [
    'http://localhost:3000',
    'http://localhost:3141',
    // Vercel preview/production URLs
    /^https:\/\/.*\.vercel\.app$/,
  ],
};

const { app, shutdown } = createServer(config);

const server = app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║     Merry AI Round - Daemon         ║
  ║     http://localhost:${config.port}          ║
  ╚══════════════════════════════════════╝

  Agents: ${config.agentsDir}
  Data:   ${config.dataDir}
  `);
});

process.on('SIGINT', () => { shutdown(); server.close(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); server.close(); process.exit(0); });
