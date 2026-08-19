import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const accessOptions = { expiresIn: env.jwtAccessExpiresIn, algorithm: 'HS256' };
const refreshOptions = { expiresIn: env.jwtRefreshExpiresIn, algorithm: 'HS256' };

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const createTokenPair = (user) => ({
  accessToken: jwt.sign({ sub: user.id, role: user.role, type: 'access' }, env.jwtAccessSecret, accessOptions),
  refreshToken: jwt.sign(
    { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
    env.jwtRefreshSecret,
    refreshOptions,
  ),
});

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtAccessSecret, {
  algorithms: ['HS256'],
});

export const verifyRefreshToken = (token) => jwt.verify(token, env.jwtRefreshSecret, {
  algorithms: ['HS256'],
});
