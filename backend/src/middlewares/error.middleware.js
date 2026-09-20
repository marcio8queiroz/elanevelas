import AppError from '../utils/AppError.js';

function normalizeError(error) {
  if (error.name === 'CastError') {
    return new AppError(`Valor inválido para o campo ${error.path}.`, 400);
  }

  if (error.code === 11000) {
    const fields = Object.keys(error.keyValue ?? {});
    const suffix = fields.length > 0 ? `: ${fields.join(', ')}` : '';
    return new AppError(`Valor duplicado em campo único${suffix}.`, 409);
  }

  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors ?? {}).map((item) => item.message);
    return new AppError(messages.join(' ') || 'Dados inválidos.', 400);
  }

  return error;
}

export default function errorMiddleware(error, req, res, next) {
  void next;

  const normalizedError = normalizeError(error);
  const statusCode = normalizedError.statusCode ?? 500;
  const status = normalizedError.status ?? 'error';

  if (!normalizedError.isOperational) {
    console.error('Erro inesperado na aplicação.');
    return res.status(500).json({
      success: false,
      message: 'Ocorreu um erro interno no servidor.',
      status: 'error',
    });
  }

  const response = {
    success: false,
    message: normalizedError.message,
    status,
  };

  return res.status(statusCode).json(response);
}
