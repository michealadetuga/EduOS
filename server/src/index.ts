import { createApp } from './app.js';
import { env } from './config/env.js';
import { getDb } from './db/connection.js';

getDb();
const app = createApp();
app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`EduOS API listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
});
