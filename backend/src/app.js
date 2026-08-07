import express from 'express';
import apiRoutes from './routes/index.js';
import notFound from './middlewares/notFound.middleware.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensagem: 'API Express funcionando!' });
});

app.use('/api/v1', apiRoutes);

app.use(notFound);
app.use(errorMiddleware);

export default app;
