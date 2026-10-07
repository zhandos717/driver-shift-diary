import { loadConfig } from './config.js';
import { JsonFileTripRepo } from './storage/json-file-repo.js';
import { TripService } from './domain/trip-service.js';
import { createApp } from './http/app.js';

const log = (entry) => console[entry.level === 'error' ? 'error' : 'log'](JSON.stringify({ time: new Date().toISOString(), ...entry }));

try {
  const config = loadConfig();
  const repo = await JsonFileTripRepo.open(config.tripsFile, config.driverOffset);
  const service = new TripService(repo, { offset: config.driverOffset });
  const server = createApp(service, { ...config, log });
  server.listen(config.port, () => log({ level: 'info', msg: `listening on http://localhost:${server.address().port}` }));

  const shutdown = (signal) => {
    log({ level: 'info', msg: `${signal}: shutting down` });
    server.close(async () => {
      await repo.flush();
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (e) {
  log({ level: 'error', msg: `failed to start: ${e.message}` });
  process.exit(1);
}
