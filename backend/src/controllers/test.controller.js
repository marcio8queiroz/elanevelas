import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const testError = asyncHandler(async () => {
  throw new AppError('Erro de teste da API', 400);
});

