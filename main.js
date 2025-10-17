const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const https = require('https');
const crypto = require('crypto');

let mainWindow;

const INSTALL_DIR = 'C:\\AoX\\AoX Client';
const CLIENT_EXE = path.join(INSTALL_DIR, 'AoX Matchmaking Client.exe');
const UNINSTALL_EXE = path.join(INSTALL_DIR, 'Uninstall.exe');
const DOWNLOAD_URL = 'http://217.154.63.61:8080/downloads/aox-client-latest.zip';
const VERSION_URL = 'http://217.154.63.61:8080/downloads/version.json';
const TEMP_ZIP = path.join(app.getPath('temp'), 'aox-client.zip');
const REGISTRY_KEY = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AoXClient';

let mainWindow;

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

app.whenReady().then(async () => {
  // Check if already installed and prompt for uninstall
  const isInstalled = await checkInstalled();
  if (isInstalled) {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Uninstall', 'Cancel'],
      defaultId: 0,
      title: 'AoX Client Already Installed',
      message: 'AoX Client is already installed. Would you like to uninstall it?'
    });
    
    if (result.response === 0) {
      // Run uninstaller
      await runUninstaller();
      app.quit();
      return;
    } else {
      app.quit();
      return;
    }
  }

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

function checkInstalled() {
  return fs.existsSync(CLIENT_EXE);
}

function runUninstaller() {
  return new Promise((resolve) => {
    if (fs.existsSync(UNINSTALL_EXE)) {
      exec(`"${UNINSTALL_EXE}"`, (error) => {
        resolve();
      });
    } else {
      // Manual cleanup
      removeFromRegistry();
      if (fs.existsSync(INSTALL_DIR)) {
        fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
      }
      resolve();
    }
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(dest);
    let receivedBytes = 0;
    let totalBytes = 0;

    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (onProgress) {
          const progress = Math.floor((receivedBytes / totalBytes) * 100);
          const downloadedMB = (receivedBytes / 1024 / 1024).toFixed(1);
          const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
          onProgress({ progress, downloadedMB, totalMB });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    const unzipper = require('unzipper');
    
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destPath }))
      .on('close', () => {
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

function verifyInstallation() {
  // Check if main executable exists
  if (!fs.existsSync(CLIENT_EXE)) {
    return false;
  }
  
  // Add more verification checks as needed
  return true;
}

function addToRegistry() {
  const regScript = `
    Windows Registry Editor Version 5.00

    [${REGISTRY_KEY.replace(/\\/g, '\\\\')}]
    "DisplayName"="AoX Matchmaking Client"
    "DisplayVersion"="1.1.3"
    "Publisher"="AoX Net"
    "InstallLocation"="${INSTALL_DIR.replace(/\\/g, '\\\\')}"
    "UninstallString"="${UNINSTALL_EXE.replace(/\\/g, '\\\\')}"
    "DisplayIcon"="${CLIENT_EXE.replace(/\\/g, '\\\\')}"
    "NoModify"=dword:00000001
    "NoRepair"=dword:00000001
  `;

  const regFile = path.join(app.getPath('temp'), 'aox-install.reg');
  fs.writeFileSync(regFile, regScript);

  return new Promise((resolve) => {
    exec(`reg import "${regFile}"`, (error) => {
      fs.unlinkSync(regFile);
      resolve(!error);
    });
  });
}

function removeFromRegistry() {
  return new Promise((resolve) => {
    exec(`reg delete "${REGISTRY_KEY}" /f`, (error) => {
      resolve(!error);
    });
  });
}

function createUninstaller() {
  const uninstallScript = `
    @echo off
    echo Uninstalling AoX Matchmaking Client...
    
    REM Close any running instances
    taskkill /F /IM "AoX Matchmaking Client.exe" 2>nul
    
    REM Remove registry entry
    reg delete "${REGISTRY_KEY}" /f 2>nul
    
    REM Remove files
    timeout /t 2 /nobreak >nul
    cd ..
    rmdir /S /Q "${INSTALL_DIR}"
    
    echo Uninstallation complete!
    pause
  `;

  const batPath = path.join(INSTALL_DIR, 'uninstall.bat');
  fs.writeFileSync(batPath, uninstallScript);

  // Convert to exe would require additional tools, for now use batch
  fs.copyFileSync(batPath, UNINSTALL_EXE.replace('.exe', '.bat'));
}

// IPC Handlers
ipcMain.handle('get-install-path', () => {
  return INSTALL_DIR;
});

ipcMain.handle('check-installed', () => {
  return checkInstalled();
});

ipcMain.handle('get-local-version', () => {
  return '1.1.3';
});

ipcMain.handle('fetch-server-version', async () => {
  return new Promise((resolve) => {
    const protocol = VERSION_URL.startsWith('https') ? require('https') : require('http');
    
    protocol.get(VERSION_URL, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || '1.1.3');
        } catch (e) {
          resolve('1.1.3');
        }
      });
    }).on('error', () => {
      resolve('1.1.3');
    });
  });
});

ipcMain.handle('download-client', async (event) => {
  try {
    // Ensure install directory exists
    if (!fs.existsSync(INSTALL_DIR)) {
      fs.mkdirSync(INSTALL_DIR, { recursive: true });
    }

    // Step 1: Download
    event.sender.send('status-update', { status: 'downloading', message: 'Downloading client...' });
    
    await downloadFile(DOWNLOAD_URL, TEMP_ZIP, (progress) => {
      event.sender.send('download-progress', progress);
    });

    // Step 2: Verify (basic check)
    event.sender.send('status-update', { status: 'verifying', message: 'Verifying download...' });
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!fs.existsSync(TEMP_ZIP) || fs.statSync(TEMP_ZIP).size === 0) {
      throw new Error('Download verification failed');
    }

    // Step 3: Extract
    event.sender.send('status-update', { status: 'installing', message: 'Installing files...' });
    await extractZip(TEMP_ZIP, INSTALL_DIR);

    // Step 4: Verify installation
    event.sender.send('status-update', { status: 'verifying', message: 'Verifying installation...' });
    
    if (!verifyInstallation()) {
      throw new Error('Installation verification failed');
    }

    // Step 5: Create uninstaller
    createUninstaller();

    // Step 6: Add to registry
    await addToRegistry();

    // Step 7: Cleanup
    if (fs.existsSync(TEMP_ZIP)) {
      fs.unlinkSync(TEMP_ZIP);
    }

    event.sender.send('status-update', { status: 'complete', message: 'Installation complete!' });
    
    return { success: true };

  } catch (err) {
    // Cleanup on error
    if (fs.existsSync(TEMP_ZIP)) {
      fs.unlinkSync(TEMP_ZIP);
    }
    if (fs.existsSync(INSTALL_DIR)) {
      fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
    }
    
    throw err;
  }
});

ipcMain.handle('launch-client', () => {
  if (fs.existsSync(CLIENT_EXE)) {
    spawn(CLIENT_EXE, [], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    // Close bootstrapper after launching
    setTimeout(() => {
      app.quit();
    }, 1000);

    return true;
  }
  return false;
});
