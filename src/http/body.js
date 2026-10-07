import { HttpError } from './errors.js';

export async function readJson(req, maxBytes) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Content-Type must be application/json');
  if (Number(req.headers['content-length']) > maxBytes) throw new HttpError(413, `body larger than ${maxBytes} bytes`);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, `body larger than ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}
