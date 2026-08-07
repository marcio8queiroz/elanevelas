import mongoose from 'mongoose';

const connectionStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function health(req, res) {
  void req;

  res.status(200).json({
    success: true,
    message: 'API ElaneVelas funcionando',
    database: connectionStates[mongoose.connection.readyState] ?? 'unknown',
  });
}

