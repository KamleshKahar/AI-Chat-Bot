import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { prisma } from '../config/prisma.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, name: user.name },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }
  );
}

function readToken(req) {
  const header = req.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Verify the bearer token and load the user. Loading on every request (rather
 * than trusting the token payload) means a deactivated account loses access
 * immediately instead of at token expiry.
 */
export async function authenticate(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw AppError.unauthorized('Missing bearer token');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      const message =
        err?.name === 'TokenExpiredError' ? 'Session expired, please sign in again' : 'Invalid token';
      throw AppError.unauthorized(message);
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user) throw AppError.unauthorized('Account no longer exists');
    if (!user.isActive) throw AppError.forbidden('Account is deactivated');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}