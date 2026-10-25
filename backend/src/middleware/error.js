import { HttpError } from '../util.js';

const CODES = { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION' };

export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: CODES[err.status] || 'SERVER', message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
  }
  // body-parser errors (oversized upload, malformed JSON) carry their own 4xx status.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'VALIDATION', message: 'The upload is too large.' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'The request body is not valid JSON.' } });
  }
  if (err.name === 'ValidationError' && err.errors) {
    const fields = {};
    for (const [k, v] of Object.entries(err.errors)) fields[k.replace(/^items\.\d+\./, '')] = v.message;
    return res.status(422).json({ error: { code: 'VALIDATION', message: Object.values(fields)[0], fields } });
  }
  if (err.code === 11000) {
    const f = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ error: { code: 'CONFLICT', message: `Duplicate ${f}.`, fields: { [f]: 'Already exists.' } } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'SERVER', message: err.message || 'Server error' } });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}
