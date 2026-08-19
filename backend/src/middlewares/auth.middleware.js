import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../services/token.service.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  void res;
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError('Autenticação necessária.', 401);
  }

  const token = authorization.slice(7).trim();
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError('Token de acesso inválido ou expirado.', 401);
  }

  if (payload.type !== 'access' || typeof payload.sub !== 'string') {
    throw new AppError('Token de acesso inválido ou expirado.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError('Autenticação inválida.', 401);
  req.user = user;
  next();
});

export const authorize = (...roles) => (req, res, next) => {
  void res;
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Você não tem permissão para esta operação.', 403));
  }
  return next();
};
