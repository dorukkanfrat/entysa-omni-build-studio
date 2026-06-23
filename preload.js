const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  discover: () => ipcRenderer.invoke('projects:discover'),
  gitInfo: (projectPath) => ipcRenderer.invoke('git:info', projectPath),
  fetch: (projectPath) => ipcRenderer.invoke('git:fetch', projectPath),
  checkout: (projectPath, branch) => ipcRenderer.invoke('git:checkout', projectPath, branch),
  preview: (params) => ipcRenderer.invoke('build:preview', params),
  pickDir: (current) => ipcRenderer.invoke('dialog:pickDir', current),
  copy: (text) => ipcRenderer.invoke('clip:copy', text),
  runBuild: (params) => ipcRenderer.invoke('build:run', params),
  pushBranch: (projectPath, branch) => ipcRenderer.invoke('git:push-branch', projectPath, branch),
  tagPush: (projectPath, tag, remotes) => ipcRenderer.invoke('git:tag-push', projectPath, tag, remotes),
  stopBuild: () => ipcRenderer.invoke('build:stop'),
  onBuildData: (cb) => ipcRenderer.on('build:data', (e, d) => cb(d)),
  onBuildEnd: (cb) => ipcRenderer.on('build:end', (e, d) => cb(d))
})
