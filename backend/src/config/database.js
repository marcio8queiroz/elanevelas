import mongoose from 'mongoose';

const connection = mongoose.connection;

connection.on('disconnected', () => {
  console.warn('MongoDB desconectado.');
});

connection.on('error', () => {
  console.error('Erro na conexão com MongoDB. Verifique a disponibilidade do banco.');
});

export async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB conectado com sucesso.');
  } catch (error) {
    console.error(
      `Não foi possível conectar ao MongoDB (${error.name}). Verifique se o serviço está em execução e se MONGODB_URI está correta.`,
    );
    throw error;
  }
}

export async function disconnectDatabase() {
  if (connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

