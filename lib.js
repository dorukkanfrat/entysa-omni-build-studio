const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function defaultConfig() {
  const root = path.join(os.homedir(), 'Desktop', 'projects')
  return {
    projectsRoot: root,
    omniBuildPath: path.join(root, 'omni_build'),
    pythonPath: 'python',
    shellPrelude: '',
    defaultNodeVersion: '22',
    nodeVersions: {}
  }
}

function shellInvocation() {
  if (process.platform === 'win32') {
    return { cmd: process.env.COMSPEC || 'cmd.exe', pre: ['/d', '/s', '/c'] }
  }
  const sh = process.env.SHELL || '/bin/zsh'
  return { cmd: sh, pre: ['-l', '-c'] }
}

const BOOT_BREW = '[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"; [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"'
const BOOT_PYENV = 'export PYENV_ROOT="$HOME/.pyenv"; [ -d "$PYENV_ROOT/bin" ] && export PATH="$PYENV_ROOT/bin:$PATH"; command -v pyenv >/dev/null 2>&1 && eval "$(pyenv init -)" >/dev/null 2>&1'
const BOOT_NVM = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1'

function withEnv(command, full, nodeVersion) {
  if (process.platform === 'win32') return command
  let boot = BOOT_BREW
  if (full) {
    const v = String(nodeVersion || '22').replace(/[^0-9.]/g, '') || '22'
    const useNode = 'nvm use ' + v + ' >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1'
    boot += '; ' + BOOT_PYENV + '; ' + BOOT_NVM + '; ' + useNode + '; echo "── Omni: Node $(node -v) ile build ──"'
  }
  return boot + '; ' + command
}

function quoteArg(value) {
  const v = String(value)
  if (process.platform === 'win32') {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return "'" + v.replace(/'/g, "'\\''") + "'"
}

function runShell(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const { cmd, pre } = shellInvocation()
    let child
    try {
      child = spawn(cmd, pre.concat([withEnv(command, false)]), { cwd })
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e) })
      return
    }
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch (e) {} }, timeoutMs || 25000)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: out, stderr: err }) })
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: String(e) }) })
  })
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'))
}

const NEXT_CONFIGS = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']

function classifyProject(dir) {
  const hasManage = fs.existsSync(path.join(dir, 'manage.py'))
  const hasPkg = fs.existsSync(path.join(dir, 'package.json'))
  const hasTemplates = fs.existsSync(path.join(dir, 'templates'))
  const hasOmnife = fs.existsSync(path.join(dir, 'omnife_project'))
  const hasNextConfig = NEXT_CONFIGS.some((f) => fs.existsSync(path.join(dir, f)))
  let type = 'unknown'
  if (hasManage && hasTemplates) type = 'django'
  else if (hasPkg && hasNextConfig) type = 'next'
  return { type, hasOmnife, hasTemplates, hasManage, hasPkg, hasNextConfig }
}

function discoverProjects(root) {
  const result = []
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch (e) {
    return result
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (/^[0-9a-f]{16,}/i.test(entry.name)) continue
    const full = path.join(root, entry.name)
    if (!isGitRepo(full)) continue
    const info = classifyProject(full)
    if (info.type === 'unknown') continue
    result.push({
      name: entry.name,
      path: full,
      type: info.type,
      hasOmnife: info.hasOmnife
    })
  }
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

function parseRefLines(stdout) {
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
}

function remoteHost(url) {
  let m = url.match(/@([^/:]+)/)
  if (m) return m[1]
  m = url.match(/\/\/([^/]+)/)
  if (m) return m[1]
  return url
}

function parseRemotes(stdout) {
  const map = {}
  const order = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
    if (!m) continue
    const name = m[1]
    const url = m[2]
    const type = m[3]
    if (!map[name]) { map[name] = { name: name, url: '' }; order.push(name) }
    if (type === 'push' || !map[name].url) map[name].url = url
  }
  return order.map((n) => {
    const r = map[n]
    return { name: r.name, url: r.url, host: remoteHost(r.url) }
  })
}

function suggestTag(tagNames) {
  const re = /^([A-Za-z][A-Za-z_-]*?)(\d+)$/
  let bestPrefix = ''
  let bestNum = -1
  for (const name of tagNames) {
    const m = name.match(re)
    if (!m) continue
    const num = parseInt(m[2], 10)
    if (num > bestNum) { bestNum = num; bestPrefix = m[1] }
  }
  if (bestNum < 0) return ''
  return bestPrefix + (bestNum + 1)
}

function detectLocales(projectPath) {
  const candidates = [
    path.join(projectPath, 'locale'),
    path.join(projectPath, 'templates', 'locale')
  ]
  const found = {}
  for (const dir of candidates) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory() && /^[a-z]{2}([_-][A-Za-z]{2,4})?$/.test(entry.name)) {
        found[entry.name] = true
      }
    }
  }
  return Object.keys(found).sort()
}

const DEV_RE = /_dev_(\d+)$/

async function gitInfo(projectPath) {
  const cur = await runShell('git rev-parse --abbrev-ref HEAD', projectPath, 8000)
  const currentBranch = (cur.stdout || '').trim()

  const remoteCmd = "git for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:short)' refs/remotes/origin"
  const remote = await runShell(remoteCmd, projectPath, 15000)

  const localCmd = "git for-each-ref --format='%(refname:short)' refs/heads"
  const local = await runShell(localCmd, projectPath, 15000)

  const tagsCmd = "git for-each-ref --sort=-creatordate --format='%(refname:short)|%(creatordate:short)' refs/tags"
  const tagsRes = await runShell(tagsCmd, projectPath, 15000)

  const remotesRes = await runShell('git remote -v', projectPath, 8000)
  const remotes = parseRemotes(remotesRes.stdout)

  const devBranches = []
  const normalBranches = []
  const seenDev = {}
  for (const line of parseRefLines(remote.stdout)) {
    const parts = line.split('|')
    let name = parts[0]
    const date = parts[1] || ''
    if (!name.startsWith('origin/')) continue
    name = name.slice('origin/'.length)
    if (name === 'HEAD') continue
    const m = name.match(DEV_RE)
    if (m) {
      if (!seenDev[name]) {
        seenDev[name] = true
        devBranches.push({ name, date, num: parseInt(m[1], 10) })
      }
    } else {
      normalBranches.push({ name, date })
    }
  }

  const localNames = parseRefLines(local.stdout)
  for (const name of localNames) {
    const m = name.match(DEV_RE)
    if (m && !seenDev[name]) {
      seenDev[name] = true
      devBranches.push({ name, date: '', num: parseInt(m[1], 10) })
    }
  }
  devBranches.sort((a, b) => b.num - a.num)

  const prefixCount = {}
  let maxNum = 0
  let bestPrefix = ''
  for (const d of devBranches) {
    const prefix = d.name.replace(DEV_RE, '')
    prefixCount[prefix] = (prefixCount[prefix] || 0) + 1
    if (d.num > maxNum) { maxNum = d.num; bestPrefix = prefix }
  }
  if (!bestPrefix) {
    let top = 0
    for (const p in prefixCount) { if (prefixCount[p] > top) { top = prefixCount[p]; bestPrefix = p } }
  }
  const folderPrefix = path.basename(projectPath).replace(/_next$/, '')
  const usePrefix = bestPrefix || folderPrefix
  const suggestedDev = usePrefix + '_dev_' + (maxNum + 1)

  const tags = []
  for (const line of parseRefLines(tagsRes.stdout)) {
    const parts = line.split('|')
    tags.push({ name: parts[0], date: parts[1] || '' })
  }

  const masterCandidates = []
  const masterSet = {}
  for (const b of normalBranches) {
    if (/^(master|main)([_-].*)?$/.test(b.name)) {
      if (!masterSet[b.name]) { masterSet[b.name] = true; masterCandidates.push(b.name) }
    }
  }
  let defaultMaster = 'master'
  if (masterCandidates.indexOf('master') === -1) {
    if (masterCandidates.indexOf('main') !== -1) defaultMaster = 'main'
    else if (masterCandidates.length) defaultMaster = masterCandidates[0]
  }

  const allBranchNames = []
  const seenAll = {}
  for (const b of normalBranches) { if (!seenAll[b.name]) { seenAll[b.name] = true; allBranchNames.push(b.name) } }
  for (const d of devBranches) { if (!seenAll[d.name]) { seenAll[d.name] = true; allBranchNames.push(d.name) } }

  return {
    currentBranch,
    devBranches,
    normalBranches,
    tags: tags.slice(0, 50),
    suggestedDev,
    masterCandidates,
    defaultMaster,
    detectedLocales: detectLocales(projectPath),
    allBranchNames,
    remotes,
    suggestedTag: suggestTag(tags.map((t) => t.name))
  }
}

function buildCommand(params, cfg) {
  const script = params.type === 'next' ? 'next_run.py' : 'django_run.py'
  const scriptPath = path.join(cfg.omniBuildPath, script)
  const python = cfg.pythonPath || 'python'

  const parts = [python, quoteArg(scriptPath)]
  parts.push('-d', quoteArg(params.projectPath))
  parts.push('-pm', quoteArg(params.pm || 'master'))

  if (params.type === 'next' && params.sm) {
    parts.push('-sm', quoteArg(params.sm))
  }

  const branches = (params.branches || []).filter(Boolean)
  if (branches.length) {
    parts.push('-b')
    for (const b of branches) parts.push(quoteArg(b))
  }

  parts.push('-dev', quoteArg(params.dev))

  if (params.useExistingDev) parts.push('-ued')
  if (params.type === 'next') parts.push('-next')

  const locales = (params.locales || []).filter(Boolean)
  if (locales.length) {
    parts.push('-l')
    for (const l of locales) parts.push(quoteArg(l))
  }

  if (params.npm) parts.push('-npm')
  if (params.type === 'next' && params.strict) parts.push('-strict')

  let command = parts.join(' ')
  if (cfg.shellPrelude && cfg.shellPrelude.trim()) {
    command = cfg.shellPrelude.trim() + ' && ' + command
  }
  return { command, cwd: cfg.omniBuildPath, scriptPath }
}

module.exports = {
  defaultConfig,
  shellInvocation,
  withEnv,
  quoteArg,
  runShell,
  classifyProject,
  discoverProjects,
  gitInfo,
  buildCommand
}
