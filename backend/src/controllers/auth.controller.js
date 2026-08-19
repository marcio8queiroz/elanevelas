import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import userResponse from '../utils/userResponse.js';
import {
  createTokenPair, hashToken, verifyRefreshToken,
} from '../services/token.service.js';

const invalidCredentials = () => new AppError('E-mail ou senha inválidos.', 401);

async function issueTokens(user) {
  const tokens = createTokenPair(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  await user.save({ validateModifiedOnly: true });
  return tokens;
}

export const register = asyncHandler(async (req, res) => {
  const { password, ...profile } = req.validated.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ ...profile, passwordHash });
  const tokens = await issueTokens(user);
  res.status(201).json({ success: true, data: { user: userResponse(user), ...tokens } });
});

export const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.validated.body.email }).select('+passwordHash');
  if (!user || !user.isActive || !(await user.comparePassword(req.validated.body.password))) {
    throw invalidCredentials();
  }
  const tokens = await issueTokens(user);
  res.json({ success: true, data: { user: userResponse(user), ...tokens } });
});

export const refresh = asyncHandler(async (req, res) => {
  const suppliedToken = req.validated.body.refreshToken;
  let payload;
  try {
    payload = verifyRefreshToken(suppliedToken);
  } catch {
    throw new AppError('Refresh token inválido ou expirado.', 401);
  }
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
    throw new AppError('Refresh token inválido ou expirado.', 401);
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  const matches = user?.refreshTokenHash
    && cryptoSafeEqual(user.refreshTokenHash, hashToken(suppliedToken));
  if (!user || !user.isActive || !matches) {
    throw new AppError('Refresh token inválido ou expirado.', 401);
  }
  const tokens = await issueTokens(user);
  res.json({ success: true, data: tokens });
});

function cryptoSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export const logout = asyncHandler(async (req, res) => {
  const suppliedToken = req.validated.body.refreshToken;
  let payload;
  try {
    payload = verifyRefreshToken(suppliedToken);
  } catch {
    return res.status(204).end();
  }
  if (payload.type === 'refresh' && typeof payload.sub === 'string') {
    await User.updateOne(
      { _id: payload.sub, refreshTokenHash: hashToken(suppliedToken) },
      { $unset: { refreshTokenHash: 1 } },
    );
  }
  return res.status(204).end();
});
