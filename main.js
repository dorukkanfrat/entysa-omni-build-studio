const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const lib = require('./lib')

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), 'utf-8')
    return Object.assign(lib.defaultConfig(), JSON.parse(raw))
  } catch (e) {
    return lib.defaultConfig()
  }
}

function writeConfig(cfg) {
  const merged = Object.assign(lib.defaultConfig(), cfg)
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(merged, null, 2))
  return merged
}

let runningChild = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0f1115',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, 'src', 'index.html'))
  win.on('closed', () => {
    killChild()
    runningChild = null
  })
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('config:get', () => readConfig())
ipcMain.handle('config:set', (e, cfg) => writeConfig(cfg))

ipcMain.handle('projects:discover', () => {
  const cfg = readConfig()
  return lib.discoverProjects(cfg.projectsRoot)
})

ipcMain.handle('git:info', async (e, projectPath) => {
  try {
    return await lib.gitInfo(projectPath)
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('git:fetch', async (e, projectPath) => {
  const fetchRes = await lib.runShell('git fetch origin --tags --prune', projectPath, 180000)
  const br = await lib.runShell('git rev-parse --abbrev-ref HEAD', projectPath, 8000)
  const branch = (br.stdout || '').trim()
  const up = await lib.runShell('git rev-parse --abbrev-ref --symbolic-full-name @{u}', projectPath, 8000)
  const hasUpstream = up.code === 0 && !!(up.stdout || '').trim()
  let pull = null
  if (fetchRes.code === 0 && branch && branch !== 'HEAD' && hasUpstream) {
    pull = await lib.runShell('git pull --ff-only', projectPath, 120000)
  }
  return { fetch: fetchRes, pull, branch, hasUpstream }
})

ipcMain.handle('git:checkout', async (e, projectPath, branch) => {
  const q = lib.quoteArg(branch)
  const local = await lib.runShell('git rev-parse --verify --quiet ' + q, projectPath, 8000)
  let cmd
  if (local.stdout && local.stdout.trim()) {
    cmd = 'git checkout ' + q
  } else {
    cmd = 'git checkout -t ' + lib.quoteArg('origin/' + branch) + ' || git checkout ' + q
  }
  const res = await lib.runShell(cmd, projectPath, 30000)
  return res
})

ipcMain.handle('build:preview', (e, params) => {
  const cfg = readConfig()
  return lib.buildCommand(params, cfg)
})

ipcMain.handle('dialog:pickDir', async (e, current) => {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: current || os.homedir()
  })
  if (res.canceled || !res.filePaths.length) return null
  return res.filePaths[0]
})

ipcMain.handle('clip:copy', (e, text) => { clipboard.writeText(String(text || '')); return true })

function safeSend(sender, channel, payload) {
  if (sender && !sender.isDestroyed()) {
    try { sender.send(channel, payload) } catch (e) {}
  }
}

function killChild() {
  if (!runningChild) return
  try {
    if (process.platform === 'win32') runningChild.kill('SIGTERM')
    else process.kill(-runningChild.pid, 'SIGTERM')
  } catch (e) {
    try { runningChild.kill('SIGKILL') } catch (e2) {}
  }
}

function streamCommand(sender, command, cwd) {
  const { cmd, pre } = lib.shellInvocation()
  let child
  try {
    child = spawn(cmd, pre.concat([command]), {
      cwd,
      detached: process.platform !== 'win32'
    })
  } catch (err) {
    safeSend(sender, 'build:data', { stream: 'err', text: 'HATA: surec baslatilamadi -> ' + String(err) + '\n' })
    safeSend(sender, 'build:end', { code: -1 })
    return { started: false }
  }

  runningChild = child
  safeSend(sender, 'build:data', { stream: 'cmd', text: command + '\n' })
  child.stdout.on('data', (d) => safeSend(sender, 'build:data', { stream: 'out', text: d.toString() }))
  child.stderr.on('data', (d) => safeSend(sender, 'build:data', { stream: 'err', text: d.toString() }))
  child.on('close', (code) => {
    runningChild = null
    safeSend(sender, 'build:end', { code })
  })
  child.on('error', (err) => {
    runningChild = null
    safeSend(sender, 'build:data', { stream: 'err', text: String(err) + '\n' })
    safeSend(sender, 'build:end', { code: -1 })
  })
  return { started: true }
}

ipcMain.handle('build:run', (e, params) => {
  const cfg = readConfig()
  const built = lib.buildCommand(params, cfg)
  if (!fs.existsSync(built.scriptPath)) {
    safeSend(e.sender, 'build:data', { stream: 'err', text: 'HATA: script bulunamadi -> ' + built.scriptPath + '\n' })
    safeSend(e.sender, 'build:end', { code: -1 })
    return { started: false }
  }
  return streamCommand(e.sender, built.command, built.cwd)
})

ipcMain.handle('git:push-branch', (e, projectPath, branch) => {
  const command = 'git push -u origin ' + lib.quoteArg(branch)
  return streamCommand(e.sender, command, projectPath)
})

ipcMain.handle('git:tag-push', (e, projectPath, tag, remotes) => {
  const qt = lib.quoteArg(tag)
  const safeRemotes = (remotes || []).filter((r) => /^[A-Za-z0-9_-]+$/.test(r))
  const parts = ['git tag ' + qt]
  for (const r of safeRemotes) parts.push('git push ' + r + ' ' + qt)
  return streamCommand(e.sender, parts.join(' && '), projectPath)
})

ipcMain.handle('build:stop', () => {
  if (!runningChild) return { stopped: false }
  killChild()
  return { stopped: true }
})
