import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pantoum-studio',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
