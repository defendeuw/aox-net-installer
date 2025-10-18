const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const http = require('http');

let mainWindow;

const INSTALL_DIR = 'C:\\\\AoX\\\\AoX Client';
const CLIENT_EXE = path.join(INSTALL_DIR, 'AoX Matchmaking Client.exe');
const UNINSTALL_EXE = path.join(INSTALL_DIR, 'Uninstall.exe');
const DOWNLOAD_URL = 'http://217.154.63.61:8080/downloads/aox-client-latest.zip';
const VERSION_URL = 'http://217.154.63.61:8080/downloads/version.json';
const REGISTRY_KEY = 'HKLM\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\AoXClient';
const MAX_RETRIES = 3;
const CHUNK_SIZE = 50 * 1024 * 1024;
const LOG_FILE = path.join(app.getPath('temp'), 'aox-installer.log');

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

log('=== AoX Installer Started ===');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 650,
    resizable: false,
    frame: true,
    backgroundColor: '#1e1b4b',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  const isInstalled = await checkInstalled();
  if (isInstalled) {
    log('AoX Client detected as already installed');
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Uninstall', 'Cancel'],
      defaultId: 0,
      title: 'AoX Client Already Installed',
      message: 'AoX Client is already installed. Would you like to uninstall it?',
      detail: `Current installation: ${CLIENT_EXE}`
    });

    if (result.response === 0) {
      log('User chose to uninstall');
      await runUninstaller();
      app.quit();
      return;
    } else {
      log('User cancelled uninstall');
      app.quit();
      return;
    }
  }

  log('No existing installation found, proceeding with installation');
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

// Improved installation check - verify complete installation
function checkInstalled() {
  log('Checking if AoX Client is already installed...');
  
  // Check registry first
  try {
    const regCheck = require('child_process').execSync(
      `reg query "${REGISTRY_KEY}" /v InstallLocation 2>nul`,
      { encoding: 'utf8' }
    );
    
    if (regCheck && regCheck.includes(INSTALL_DIR)) {
      log('Found registry entry for AoX Client');
      
      // Verify the EXE actually exists and is valid
      if (fs.existsSync(CLIENT_EXE)) {
        const stats = fs.statSync(CLIENT_EXE);
        // EXE should be at least 50MB to be a valid Electron app
        if (stats.size > 50 * 1024 * 1024) {
          log(`Valid installation found: ${CLIENT_EXE}` (${(stats.size / 1024 / 1024).toFixed(2)}` MB)`);
          return true;
        } else {
          log(`EXE exists but is too small (${stats.size}` bytes) - likely corrupt`);
        }
      } else {
        log('Registry entry exists but EXE not found - cleaning up registry');
        removeFromRegistry();
      }
    }
  } catch (err) {
    log(`No registry entry found (this is normal for fresh install): ${err.message}`);
  }

  // Double-check: even without registry, check if files exist
  if (fs.existsSync(CLIENT_EXE)) {
    try {
      const stats = fs.statSync(CLIENT_EXE);
      if (stats.size > 50 * 1024 * 1024) {
        log(`Found valid EXE without registry entry: ${CLIENT_EXE}`);
        return true;
      }
    } catch (err) {
      log(`Error checking EXE: ${err.message}`);
    }
  }

  log('No valid installation detected');
  return false;
}

function runUninstaller() {
  return new Promise((resolve) => {
    if (fs.existsSync(UNINSTALL_EXE)) {
      log(`Running uninstaller: ${UNINSTALL_EXE}`);
      exec(`"${UNINSTALL_EXE}"`, (error) => {
        if (error) {
          log(`Uninstaller error: ${error.message}`);
        }
        resolve();
      });
    } else {
      log('Uninstaller not found, performing manual cleanup');
      removeFromRegistry();
      if (fs.existsSync(INSTALL_DIR)) {
        try {
          fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
          log(`Removed install directory: ${INSTALL_DIR}`);
        } catch (err) {
          log(`Error removing install directory: ${err.message}`);
        }
      }
      resolve();
    }
  });
}

// � AI-POWERED DOWNLOAD WITH INTELLIGENT FALLBACKS
function downloadFileWithRetry(url, dest, onProgress, event, retryCount = 0) {
  return new Promise(async (resolve, reject) => {
    log(`� AI Smart Download: Attempt ${retryCount + 1}`/${MAX_RETRIES + 1}`...`);
    if (event) {
      event.sender.send('ai-message', `� AI analyzing best download method (attempt ${retryCount + 1}`/${MAX_RETRIES + 1}`)...`);
    }

    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      log(`Created directory: ${destDir}`);
    }

    // Define download methods in priority order
    const methods = [
      { name: 'HTTP with Connection Keepalive', fn: downloadWithHTTPKeepalive },
      { name: 'Chunked Download with Resume', fn: downloadInChunks },
      { name: 'Basic HTTP Stream', fn: downloadFileSingle },
      { name: 'PowerShell with Progress', fn: downloadWithPowerShell }
    ];

    // Try each method
    for (let i = 0; i < methods.length; i++) {
      const method = methods[i];
      try {
        log(`� Trying method ${i + 1}`/${methods.length}`: ${method.name}`...`);
        if (event) {
          event.sender.send('ai-message', `� Trying: ${method.name}`...`);
        }

        if (method.name === 'Basic HTTP Stream') {
          const protocol = url.startsWith('https') ? require('https') : require('http');
          await method.fn(url, dest, onProgress, protocol);
        } else {
          await method.fn(url, dest, onProgress);
        }

        // Verify download succeeded
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
          log(`✅ Download successful with ${method.name}`);
          if (event) {
            event.sender.send('ai-message', `✅ Success with ${method.name}`);
          }
          return resolve();
        }

      } catch (error) {
        log(`⚠️ ${method.name}` failed: ${error.message}`);
        if (event) {
          event.sender.send('ai-message', `⚠️ ${method.name}` failed, trying next...`);
        }

        // Clean up partial download
        if (fs.existsSync(dest)) {
          try {
            fs.unlinkSync(dest);
            log(`Cleaned up partial file: ${dest}`);
          } catch (e) {
            log(`Could not clean partial file: ${e.message}`);
          }
        }
      }
    }

    // All methods failed - retry if attempts remaining
    if (retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
      log(`⏳ All methods failed. AI deciding to retry in ${waitTime/1000}`s...`);
      if (event) {
        event.sender.send('ai-message', `� All methods failed. AI retrying in ${waitTime/1000}`s...`);
      }

      await new Promise(r => setTimeout(r, waitTime));

      try {
        await downloadFileWithRetry(url, dest, onProgress, event, retryCount + 1);
        resolve();
      } catch (retryError) {
        reject(retryError);
      }
    } else {
      const finalError = new Error(`❌ AI exhausted all ${MAX_RETRIES + 1}` attempts and ${methods.length}` methods`);
      log(finalError.message);
      reject(finalError);
    }
  });
}

// Method 1: HTTP with Connection keepalive (most reliable for large files)
function downloadWithHTTPKeepalive(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(dest);
    let receivedBytes = 0;
    let totalBytes = 0;

    const options = {
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100'
      }
    };

    const request = protocol.get(url, options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);
      log(`Download size: ${(totalBytes / 1024 / 1024).toFixed(2)}` MB`);

      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (onProgress && totalBytes) {
          onProgress({
            percent: Math.round((receivedBytes / totalBytes) * 100),
            received: receivedBytes,
            total: totalBytes
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          log(`File written: ${dest}`);
          resolve();
        });
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });

    file.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });

    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Method 2: Download in chunks with resume capability
function downloadInChunks(url, dest, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const protocol = url.startsWith('https') ? require('https') : require('http');

      // Get file size first
      const sizeReq = await new Promise((res, rej) => {
        protocol.request(url, { method: 'HEAD' }, (response) => {
          res(parseInt(response.headers['content-length'], 10));
        }).on('error', rej).end();
      });

      const totalBytes = sizeReq;
      let downloadedBytes = 0;

      const writeStream = fs.createWriteStream(dest);

      // Download in chunks
      const chunkSize = CHUNK_SIZE;
      for (let start = 0; start < totalBytes; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, totalBytes - 1);

        const chunk = await new Promise((res, rej) => {
          const options = {
            headers: {
              'Range': `bytes=${start}`-${end}`
            }
          };

          protocol.get(url, options, (response) => {
            const buffers = [];
            response.on('data', (data) => buffers.push(data));
            response.on('end', () => res(Buffer.concat(buffers)));
          }).on('error', rej);
        });

        writeStream.write(chunk);
        downloadedBytes += chunk.length;

        if (onProgress) {
          onProgress({
            percent: Math.round((downloadedBytes / totalBytes) * 100),
            received: downloadedBytes,
            total: totalBytes
          });
        }
      }

      writeStream.end();
      await new Promise((res, rej) => {
        writeStream.on('finish', res);
        writeStream.on('error', rej);
      });

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// Method 3: Basic stream download
function downloadFileSingle(url, dest, onProgress, protocol) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let receivedBytes = 0;
    let totalBytes = 0;

    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Server returned status code ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (onProgress && totalBytes) {
          onProgress({
            percent: Math.round((receivedBytes / totalBytes) * 100),
            received: receivedBytes,
            total: totalBytes
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });

    file.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

// Method 4: PowerShell fallback
function downloadWithPowerShell(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const escapedDest = dest.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "''");
    const psScript = `
      $ProgressPreference = 'SilentlyContinue';
      Invoke-WebRequest -Uri '${url}`' -OutFile '${escapedDest}`' -UseBasicParsing -TimeoutSec 120
    `;

    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '"')}`"`, 
      { maxBuffer: 10 * 1024 * 1024 },
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

// � AI-POWERED ZIP EXTRACTION with multiple methods
function extractZip(zipPath, targetPath, onProgress, event) {
  return new Promise(async (resolve, reject) => {
    log(`� AI Smart Extraction starting...`);
    if (event) {
      event.sender.send('ai-message', '� AI analyzing best extraction method...');
    }

    // Ensure target exists
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
      log(`Created target directory: ${targetPath}`);
    }

    const methods = [
      { name: 'Node.js adm-zip', fn: extractWithAdmZip },
      { name: 'PowerShell Expand-Archive', fn: extractWithPowerShell },
      { name: 'Node.js unzipper stream', fn: extractWithUnzipper }
    ];

    for (let i = 0; i < methods.length; i++) {
      const method = methods[i];
      try {
        log(`� Trying extraction method ${i + 1}`/${methods.length}`: ${method.name}`...`);
        if (event) {
          event.sender.send('ai-message', `� Trying: ${method.name}`...`);
        }

        await method.fn(zipPath, targetPath, onProgress);

        // Verify extraction
        const files = fs.readdirSync(targetPath);
        if (files.length > 0) {
          log(`✅ Extraction successful with ${method.name}` (${files.length}` files/folders)`);
          if (event) {
            event.sender.send('ai-message', `✅ Success with ${method.name}`);
          }
          return resolve();
        }

      } catch (error) {
        log(`⚠️ ${method.name}` failed: ${error.message}`);
        if (event) {
          event.sender.send('ai-message', `⚠️ ${method.name}` failed, trying next...`);
        }

        // Clean up failed extraction
        try {
          if (fs.existsSync(targetPath)) {
            const files = fs.readdirSync(targetPath);
            files.forEach(file => {
              const filePath = path.join(targetPath, file);
              try {
                fs.rmSync(filePath, { recursive: true, force: true });
              } catch (e) {
                log(`Could not remove: ${filePath}`);
              }
            });
          }
        } catch (cleanupErr) {
          log(`Cleanup warning: ${cleanupErr.message}`);
        }
      }
    }

    reject(new Error('All extraction methods failed'));
  });
}

// Extraction Method 1: adm-zip
function extractWithAdmZip(zipPath, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(targetPath, true);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// Extraction Method 2: PowerShell with proper path quoting
function extractWithPowerShell(zipPath, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    // Use short 8.3 filenames if path contains spaces
    const quotedZip = zipPath.includes(' ') ? `"${zipPath}`"` : zipPath;
    const quotedTarget = targetPath.includes(' ') ? `"${targetPath}`"` : targetPath;
    
    const psCommand = `Expand-Archive -Path ${quotedZip}` -DestinationPath ${quotedTarget}` -Force`;
    
    log(`PowerShell command: ${psCommand}`);
    
    exec(`powershell.exe -NoProfile -Command "${psCommand}`"`, 
      { maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          log(`PowerShell stderr: ${stderr}`);
          reject(new Error(`PowerShell extraction failed: ${stderr || error.message}`));
        } else {
          log('PowerShell extraction completed');
          resolve();
        }
      }
    );
  });
}

// Extraction Method 3: unzipper
function extractWithUnzipper(zipPath, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const unzipper = require('unzipper');
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: targetPath }))
        .on('close', () => resolve())
        .on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

function verifyInstallation() {
  log('Verifying installation...');
  
  if (!fs.existsSync(CLIENT_EXE)) {
    log('Verification failed: Client EXE not found');
    return false;
  }

  const stats = fs.statSync(CLIENT_EXE);
  log(`Client EXE size: ${(stats.size / 1024 / 1024).toFixed(2)}` MB`);
  
  if (stats.size < 1024 * 1024) {
    log('Verification failed: Client EXE too small');
    return false;
  }

  log('Verification passed');
  return true;
}

function createUninstaller() {
  const uninstallScript = `
@echo off
echo Uninstalling AoX Client...
timeout /t 2 /nobreak > nul
rd /s /q "${INSTALL_DIR}`"
reg delete "${REGISTRY_KEY}`" /f 2>nul
del /f /q "%APPDATA%\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\AoX Net.lnk" 2>nul
echo Uninstall complete.
pause
del "%~f0"
  `;

  fs.writeFileSync(UNINSTALL_EXE, uninstallScript);
  log(`Uninstaller created: ${UNINSTALL_EXE}`);
}

async function addToRegistry() {
  return new Promise((resolve, reject) => {
    const commands = [
      `reg add "${REGISTRY_KEY}`" /v DisplayName /t REG_SZ /d "AoX Matchmaking Client" /f`,
      `reg add "${REGISTRY_KEY}`" /v InstallLocation /t REG_SZ /d "${INSTALL_DIR}`" /f`,
      `reg add "${REGISTRY_KEY}`" /v UninstallString /t REG_SZ /d "${UNINSTALL_EXE}`" /f`,
      `reg add "${REGISTRY_KEY}`" /v DisplayIcon /t REG_SZ /d "${CLIENT_EXE}`" /f`
    ];

    let completed = 0;
    commands.forEach(cmd => {
      exec(cmd, (error) => {
        if (error) {
          log(`Registry command failed: ${cmd}` - ${error.message}`);
        } else {
          log(`Registry command succeeded: ${cmd}`);
        }
        completed++;
        if (completed === commands.length) {
          resolve();
        }
      });
    });
  });
}

function removeFromRegistry() {
  exec(`reg delete "${REGISTRY_KEY}`" /f`, (error) => {
    if (error) {
      log(`Registry removal failed (may not exist): ${error.message}`);
    } else {
      log('Registry entry removed');
    }
  });
}

// Main download and installation handler
ipcMain.handle('download-client', async (event) => {
  const tempDir = path.join(app.getPath('temp'), 'aox-install-' + Date.now());
  const TEMP_ZIP = path.join(tempDir, 'aox-client.zip');

  try {
    log('=== Starting Installation ===');
    event.sender.send('ai-message', '� AI-powered installation starting...');

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      log(`Created temp directory: ${tempDir}`);
    }

    // Step 1: Check server connection
    event.sender.send('status-update', { status: 'checking', message: 'Checking server connection...' });
    event.sender.send('ai-message', '� AI checking server availability...');

    const serverOk = await new Promise((resolve) => {
      const request = http.get(VERSION_URL, (response) => {
        resolve(response.statusCode === 200);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(5000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (!serverOk) {
      throw new Error('Cannot connect to download server. Please check your internet connection.');
    }

    log('Server connection OK');
    event.sender.send('ai-message', '✅ Server connection verified');

    // Step 2: Download with AI
    event.sender.send('status-update', { 
      status: 'downloading', 
      message: `Downloading from server...`,
      downloadPath: `Downloading to: ${TEMP_ZIP}`
    });

    await downloadFileWithRetry(
      DOWNLOAD_URL,
      TEMP_ZIP,
      (progress) => {
        event.sender.send('download-progress', {
          percent: progress.percent,
          received: progress.received,
          total: progress.total
        });
      },
      event
    );

    // Verify download
    const fileSize = fs.statSync(TEMP_ZIP).size;
    if (fileSize === 0) {
      throw new Error('Downloaded file is empty (0 bytes)');
    }

    log(`Download verified: ${TEMP_ZIP}` (${(fileSize / 1024 / 1024).toFixed(2)}` MB)`);
    event.sender.send('ai-message', `✅ Download verified: ${(fileSize / 1024 / 1024).toFixed(2)}` MB`);

    // Step 3: Extract with AI
    event.sender.send('status-update', {
      status: 'installing',
      message: `Extracting files...`,
      installPath: `Installing to: ${INSTALL_DIR}`
    });

    await extractZip(TEMP_ZIP, INSTALL_DIR, null, event);

    // Step 4: Verify installation
    event.sender.send('status-update', { status: 'verifying', message: 'Verifying installation...' });
    event.sender.send('ai-message', '� Verifying installation...');

    if (!verifyInstallation()) {
      throw new Error('Installation verification failed');
    }

    event.sender.send('ai-message', '✅ Installation verified');

    // Step 5: Create uninstaller and registry
    event.sender.send('ai-message', '� Creating uninstaller and shortcuts...');
    createUninstaller();
    await addToRegistry();

    // Step 6: Cleanup
    event.sender.send('ai-message', '� Cleaning up temporary files...');
    if (fs.existsSync(TEMP_ZIP)) {
      fs.unlinkSync(TEMP_ZIP);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    event.sender.send('status-update', { status: 'complete', message: 'Installation complete!' });
    event.sender.send('ai-message', '✅ Installation complete!');

    log('=== Installation Completed Successfully ===');
    return { success: true };

  } catch (err) {
    log(`=== Installation Failed: ${err.message}` ===`);

    // Comprehensive AI-powered cleanup on failure
    try {
      event.sender.send('ai-message', '� Cleaning up failed installation...');

      // Remove temp directory and all contents
      if (fs.existsSync(tempDir)) {
        log('Cleaning up: Removing temp directory...');
        fs.rmSync(tempDir, { recursive: true, force: true });
      }

      // Remove temp zip if it exists elsewhere
      if (fs.existsSync(TEMP_ZIP)) {
        log('Cleaning up: Removing temp zip...');
        fs.unlinkSync(TEMP_ZIP);
      }

      // Remove incomplete installation
      if (fs.existsSync(INSTALL_DIR)) {
        // Check if installation was actually completed
        if (!fs.existsSync(CLIENT_EXE)) {
          log('Cleaning up: Removing incomplete installation...');
          fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
        }
      }

      log('Cleanup complete');
      event.sender.send('ai-message', '✅ Cleanup complete');
    } catch (cleanupErr) {
      log(`Cleanup error (non-fatal): ${cleanupErr.message}`);
    }

    // Send error to UI
    event.sender.send('status-update', {
      status: 'error',
      message: 'Installation failed - all files cleaned up'
    });

    throw err;
  }
});

ipcMain.handle('show-logs', () => {
  const { shell } = require('electron');

  if (fs.existsSync(LOG_FILE)) {
    shell.openPath(LOG_FILE);
    log('User opened log file');
    return true;
  } else {
    log('Log file does not exist yet');
    const msg = '=== AoX Installer Log ===\nNo log entries yet. The installer may not have started properly.\n';
    fs.writeFileSync(LOG_FILE, msg);
    shell.openPath(LOG_FILE);
    return false;
  }
});

// � AI-POWERED LAUNCH with multiple fallback methods
ipcMain.handle('launch-client', async () => {
  if (!fs.existsSync(CLIENT_EXE)) {
    log('❌ Client EXE not found, cannot launch');
    return false;
  }

  log('� AI attempting to launch client...');

  // Method 1: Using cmd.exe with proper quoting
  try {
    log('� Trying method 1: cmd.exe with start...');
    spawn('cmd.exe', ['/c', 'start', '', `"${CLIENT_EXE}`"`], {
      detached: true,
      stdio: 'ignore',
      shell: false
    }).unref();

    log('✅ Client launched successfully (method 1)');
    setTimeout(() => app.quit(), 1000);
    return true;
  } catch (err1) {
    log(`⚠️ Method 1 failed: ${err1.message}`);
  }

  // Method 2: Using shell.openPath
  try {
    log('� Trying method 2: shell.openPath...');
    const { shell } = require('electron');
    await shell.openPath(CLIENT_EXE);
    log('✅ Client launched successfully (method 2)');
    setTimeout(() => app.quit(), 1000);
    return true;
  } catch (err2) {
    log(`⚠️ Method 2 failed: ${err2.message}`);
  }

  // Method 3: Using PowerShell
  try {
    log('� Trying method 3: PowerShell Start-Process...');
    await new Promise((resolve, reject) => {
      exec(`powershell.exe -Command "Start-Process -FilePath '${CLIENT_EXE}`'"`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    log('✅ Client launched successfully (method 3)');
    setTimeout(() => app.quit(), 1000);
    return true;
  } catch (err3) {
    log(`⚠️ Method 3 failed: ${err3.message}`);
  }

  // Method 4: Direct spawn with shell
  try {
    log('� Trying method 4: spawn with shell...');
    spawn(CLIENT_EXE, [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();

    log('✅ Client launched successfully (method 4)');
    setTimeout(() => app.quit(), 1000);
    return true;
  } catch (err4) {
    log(`⚠️ Method 4 failed: ${err4.message}`);
  }

  log('❌ All launch methods failed');
  return false;
});

