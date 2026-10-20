import { app, BrowserWindow, dialog, shell } from 'electron';
import { dirname, join, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import express from 'express';
import { detectRedirectedAppData } from './src/util/appdata-redirect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow;
let server;

async function startServer() {
  // Imported here, not statically: routes and services read SHERLOCKMAIL_DATA_DIR at module load,
  // and a static import would evaluate them before it is set, pointing them into the read-only asar.
  const { default: apiRoutes } = await import('./src/api/routes.js');
  return new Promise((resolve) => {
    const expressApp = express();
    expressApp.use(express.json({ limit: '50mb' }));
    expressApp.use(express.static(join(__dirname, 'public')));

    expressApp.post('/api/pick-folder', async (req, res) => {
      if (!mainWindow) return res.status(500).json({ error: 'No window available' });
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Destination Folder',
      });
      if (result.canceled) return res.json({ canceled: true });
      res.json({ path: result.filePaths[0] });
    });

    expressApp.post('/api/open-folder', async (req, res) => {
      const folderPath = req.body.path;
      if (!folderPath) return res.status(400).json({ error: 'No path provided' });
      const resolved = isAbsolute(folderPath) ? folderPath : join(__dirname, folderPath);
      if (!existsSync(resolved)) return res.status(404).json({ error: 'Folder does not exist yet — run an export first' });
      const result = await shell.openPath(resolved);
      if (result) return res.status(500).json({ error: result });
      res.json({ ok: true });
    });

    expressApp.use('/api', apiRoutes);
    expressApp.get('*', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });

    server = expressApp.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`SherlockMail server running on port ${port}`);
      resolve(port);
    });
  });
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SherlockMail',
    icon: join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const redirect = detectRedirectedAppData(app.getPath('userData'));
  if (redirect) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'SherlockMail is running inside another app',
      message: 'SherlockMail was started from inside another application\'s sandbox.',
      detail: `Windows is redirecting everything SherlockMail saves into a private folder of the package "${redirect.packageName}":\n\n${redirect.redirectedDir}\n\nCollections, logs and the case database would be stored there instead of your normal SherlockMail data, and would be lost if that application is reset or uninstalled.\n\nClose SherlockMail and start it from the Start menu or a desktop shortcut.`,
      buttons: ['Quit', 'Continue anyway'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 0) {
      app.quit();
      return;
    }
  }
  if (!process.env.SHERLOCKMAIL_DATA_DIR) {
    process.env.SHERLOCKMAIL_DATA_DIR = join(app.getPath('userData'), 'data');
  }
  const port = await startServer();
  await createWindow(port);
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

app.on('activate', async () => {
  if (!mainWindow) {
    const port = server?.address()?.port;
    if (port) await createWindow(port);
  }
});
