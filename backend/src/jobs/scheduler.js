// In-process reminder scheduler: once a minute, run each reminder whose configured daily
// time (appSettings.reminderCron.<key>, 'HH:MM' in appSettings.timezone) has arrived and
// has not run today. Re-running is harmless anyway — commsLogs dedupe each reminder.
// Disable with DISABLE_SCHEDULER=1 (e.g. when a separate worker hits /jobs/* instead).
import { AppSettings } from '../models/org.js';
import { REMINDER_JOBS, localDate } from '../services/comms.js';

const lastRun = new Map(); // key → YYYY-MM-DD it last ran

function localTime(timezone, now) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export async function tick(now = new Date()) {
  const settings = await AppSettings.findOne().lean();
  const tz = settings?.timezone;
  const nowHm = localTime(tz, now);
  const today = localDate(tz, 0, now);
  for (const [key, run] of Object.entries(REMINDER_JOBS)) {
    const at = settings?.reminderCron?.[key];
    if (!/^\d{2}:\d{2}$/.test(at || '') || nowHm < at || lastRun.get(key) === today) continue;
    lastRun.set(key, today);
    const result = await run({ now });
    console.log(`[reminders] ${key} ${today}: ${result.status}${result.reason ? ` (${result.reason})` : ''} sent=${result.sent} failed=${result.failed}`);
  }
}

export function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === '1') return null;
  const timer = setInterval(() => tick().catch((e) => console.error('[reminders] tick failed:', e.message)), 60_000);
  timer.unref();
  return timer;
}
