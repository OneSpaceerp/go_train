import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'go-train-dev-secret-change-me';

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '30d' });

// Express middleware: require a valid Bearer token; attaches req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, SECRET);
    const { rows } = await query(
      'SELECT id, email, full_name, role, locale, theme, avatar_url, phone, bio FROM users WHERE id=$1',
      [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Account not found' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

// Gate a route to a role.
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your role' });
