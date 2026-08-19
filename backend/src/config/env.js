import 'dotenv/config';

const env = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
};

if (!process.env.MONGODB_URI) {
  throw new Error('A variável de ambiente MONGODB_URI não foi definida.');
}

if (!Number.isInteger(env.port) || env.port <= 0) {
  throw new Error('A variável de ambiente PORT deve ser uma porta válida.');
}

if (!env.jwtAccessSecret || !env.jwtRefreshSecret) {
  throw new Error('As variáveis JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser definidas.');
}

if (env.jwtAccessSecret === env.jwtRefreshSecret) {
  throw new Error('Os segredos dos tokens de acesso e renovação devem ser diferentes.');
}

export default env;
