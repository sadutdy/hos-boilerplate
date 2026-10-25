import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connect } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { startScheduler } from './jobs/scheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const commsMod = await import('./routes/comms.js');

const modules = [
  await import('./routes/auth.js'),
  await import('./routes/patients.js'),
  await import('./routes/appointments.js'),
  await import('./routes/clinic.js'),
  await import('./routes/ward.js'),
  await import('./routes/staff.js'),
  await import('./routes/pharmacy.js'),
  await import('./routes/clinical-records.js'),
  await import('./routes/invoices.js'),
  await import('./routes/accounting.js'),
  await import('./routes/reports.js'),
  await import('./routes/dashboard.js'),
  await import('./routes/settings.js'),
  commsMod,
];

const api = express.Router();
app.use('/api/v1', commsMod.workerRouter);
for (const mod of modules) {
  const router = mod.default;
  if (router) api.use(router);
}
app.use('/api/v1', api);

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
await connect();
app.listen(port, () => {
  console.log(`hos-boilerplate-api listening on http://localhost:${port}/api/v1`);
});
startScheduler();
