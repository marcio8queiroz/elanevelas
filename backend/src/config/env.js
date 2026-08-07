import 'dotenv/config';

const env = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

if (!process.env.MONGODB_URI) {
  throw new Error('A variável de ambiente MONGODB_URI não foi definida.');
}

if (!Number.isInteger(env.port) || env.port <= 0) {
  throw new Error('A variável de ambiente PORT deve ser uma porta válida.');
}

export default env;

