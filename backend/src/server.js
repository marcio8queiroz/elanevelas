import mongoose from 'mongoose';
import env from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import app from './app.js';

let server;
let isShuttingDown = false;

async function closeResources() {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
    console.log('Servidor HTTP encerrado.');
  }

  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
    console.log('Conexão com MongoDB encerrada.');
  }
}

async function shutdown(reason, exitCode = 0, error) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Encerrando aplicação: ${reason}.`);
  if (error) {
    console.error(`Erro fatal não tratado (${error.name ?? 'Error'}).`);
  }

  try {
    await closeResources();
  } catch (shutdownError) {
    console.error('Erro durante o encerramento da aplicação.', shutdownError);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => shutdown('unhandledRejection', 1, error));
process.on('uncaughtException', (error) => shutdown('uncaughtException', 1, error));

async function start() {
  try {
    await connectDatabase();

    server = app.listen(env.port, () => {
      console.log(`Servidor rodando em http://localhost:${env.port}`);
    });
  } catch {
    await shutdown('falha na inicialização', 1);
  }
}

start();
