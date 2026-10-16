import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './src/api/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SherlockMail running at http://localhost:${PORT}`);
});
