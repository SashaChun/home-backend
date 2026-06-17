import 'dotenv/config';
import { createApp } from './app.js';
import { ensureBucket } from './services/storage.js';

const PORT = process.env.PORT || 4000;

await ensureBucket().catch((e) => console.warn('[minio] bucket setup failed:', e.message));

const app = createApp();
app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
