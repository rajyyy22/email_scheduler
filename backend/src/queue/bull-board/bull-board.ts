import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { allQueues } from '../queues/queue-factory.js';

export function setupBullBoard(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: allQueues.map((q) => new BullMQAdapter(q as any) as any),
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
