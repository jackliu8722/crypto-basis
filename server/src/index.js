import { openDb } from './db.js';
import { createRepository } from './repository.js';
import { createPriceService } from './priceService.js';
import { createApp } from './server.js';

const db = openDb();
const app = createApp({ repo: createRepository(db), priceService: createPriceService(db) });

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`server: http://127.0.0.1:${port}`));
