const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;

const INSTALL_DIR = 'C:\\AoX\\AoX Client';
const CLIENT_EXE = path.join(INSTALL_DIR, 'AoX Matchmaking Client.exe');
const SOURCE_DIR = 'D:\\AoX\\AoX\\release\\win-unpacked';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
    frame: true,
    backgroundColor: '#1e1b4b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// IPC Handlers
ipcMain.handle('get-install-path', () => {
  return INSTALL_DIR;
});

ipcMain.handle('check-installed', () => {
  return fs.existsSync(CLIENT_EXE);
});

ipcMain.handle('get-local-version', () => {
  return '1.2.0';
});

ipcMain.handle('fetch-server-version', async () => {
  return '1.2.0';
});

ipcMain.handle('download-client', async (event) => {
  return new Promise((resolve, reject) => {
    try {
      event.sender.send('status-update', { status: 'downloading', message: 'Installing client...' });
      
      // Ensure install directory exists
      if (!fs.existsSync(INSTALL_DIR)) {
        fs.mkdirSync(INSTALL_DIR, { recursive: true });
      }

      // Copy files from source
      const totalSteps = 100;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep += 5;
        if (currentStep <= 80) {
          event.sender.send('download-progress', {
            progress: currentStep,
            downloadedMB: (currentStep * 5).toFixed(1),
            totalMB: '500.0'
          });
        }
      }, 100);

      // Perform the copy
      copyDir(SOURCE_DIR, INSTALL_DIR);

      clearInterval(interval);

      event.sender.send('download-progress', {
        progress: 100,
        downloadedMB: '500.0',
        totalMB: '500.0'
      });

      event.sender.send('status-update', { status: 'complete', message: 'Installation complete!' });

      setTimeout(() => {
        resolve({ success: true });
      }, 500);

    } catch (err) {
      reject(err);
    }
  });
});

ipcMain.handle('launch-client', () => {
  if (fs.existsSync(CLIENT_EXE)) {
    exec(`"${CLIENT_EXE}"`, (error) => {
      if (error) {
        console.error('Failed to launch client:', error);
        return false;
      }
    });
    
    // Close bootstrapper after launching
    setTimeout(() => {
      app.quit();
    }, 1000);
    
    return true;
  }
  return false;
});
