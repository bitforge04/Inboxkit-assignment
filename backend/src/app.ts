import express from 'express';
import cors    from 'cors';
import cookieParser from 'cookie-parser';
import { config }   from './config/env';
import healthRouter from './routes/health';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', healthRouter);

  return app;
}
