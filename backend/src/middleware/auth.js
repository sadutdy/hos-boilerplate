import jwt from 'jsonwebtoken';
import { User, RolePermission, ActivityLog } from '../models/auth.js';
import { HttpError, forbidden, ah } from '../util.js';
import { PERMISSION_CATALOGUE } from '../config/permissions.js';

export function signToken(user, extra = {}) {
  return jwt.sign({ sub: String(user._id), role: user.role, ...extra }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '15m' });
}

export const auth = ah(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Unauthenticated.');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Session expired. Please log in again.');
  }
  next();
});

const permCache = new Map();
export function flushPermissions() { permCache.clear(); }

async function grantsFor(role) {
  if (permCache.has(role)) return permCache.get(role);
  const doc = await RolePermission.findOne({ role });
  const keys = new Set(doc ? doc.keys : []);
  permCache.set(role, keys);
  return keys;
}

export const requirePermission = (key) => ah(async (req, res, next) => {
  const role = req.user.role;
  if (role === 'admin') return next();
  const keys = await grantsFor(role);
  if (!keys.has(key)) throw forbidden();
  next();
});

export const requirePermissionFn = (fn) => ah(async (req, res, next) => {
  const role = req.user.role;
  if (role === 'admin') return next();
  const keys = await grantsFor(role);
  if (!keys.has(fn(req))) throw forbidden();
  next();
});

export const requireAnyPermission = (keys) => ah(async (req, res, next) => {
  const role = req.user.role;
  if (role === 'admin') return next();
  const granted = await grantsFor(role);
  if (!keys.some((k) => granted.has(k))) throw forbidden();
  next();
});

export const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};

export async function currentUser(req) {
  return User.findById(req.user.sub);
}

export const activity = (req, res, next) => {
  // Every module router mounts this on the shared /api/v1 stack, so a request can pass it
  // many times; log it once.
  if (res.locals.activityHooked) return next();
  res.locals.activityHooked = true;
  res.on('finish', () => {
    setImmediate(() => {
      try {
        const verbs = { POST: 'created', PUT: 'edited', PATCH: 'edited', DELETE: 'deleted', GET: 'viewed' };
        const userType = req.user ? 'registered' : 'guest';
        ActivityLog.create({
          description: `${verbs[req.method] || req.method} ${req.baseUrl}${req.route ? '/' + req.route.path : ''}`.replace('//', '/'),
          userType,
          userId: req.user ? req.user.sub : null,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          locale: req.headers['accept-language'],
          referer: req.headers.referer,
          method: req.method,
          route: req.originalUrl,
        });
      } catch { /* log must never break the response */ }
    });
  });
  next();
};

export default { auth, requirePermission, activity, signToken };
