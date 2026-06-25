const appApi = window.api

const COMMON_LOCALES = ['tr', 'en', 'de', 'fr', 'ar', 'ru', 'es', 'it', 'nl', 'pl']

const state = {
  config: null,
  projects: [],
  filtered: [],
  selected: null,
  info: null,
  selectedBranches: [],
  selectedLocales: [],
  branchFilter: ''
}

const $ = (id) => document.getElementById(id)

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

async function init() {
  state.config = await appApi.getConfig()
  await loadProjects()
  bindStatic()
  bindBuildEvents()
  bindConsoleResize()
}

function bindConsoleResize() {
  const panel = $('consolePanel')
  const handle = $('consoleResize')
  let dragging = false
  handle.addEventListener('mousedown', (e) => {
    dragging = true
    e.preventDefault()
    document.body.style.userSelect = 'none'
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const min = 120
    const max = window.innerHeight - 60
    const h = Math.max(min, Math.min(max, window.innerHeight - e.clientY))
    panel.style.height = h + 'px'
  })
  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    document.body.style.userSelect = ''
  })
}

async function loadProjects() {
  state.projects = await appApi.discover()
  state.filtered = state.projects.slice()
  renderProjectList()
}

function renderProjectList() {
  const list = $('projectList')
  list.innerHTML = ''
  if (!state.filtered.length) {
    const e = el('div', 'pi-sub', 'Proje bulunamadi. Ayarlardan kok dizini kontrol et.')
    e.style.padding = '10px'
    list.appendChild(e)
    return
  }
  for (const p of state.filtered) {
    const item = el('div', 'project-item')
    if (state.selected && state.selected.path === p.path) item.classList.add('active')
    const name = el('div', 'pi-name')
    name.appendChild(el('span', null, p.name))
    const badge = el('span', 'badge ' + p.type, p.type)
    badge.style.fontSize = '9px'
    badge.style.padding = '2px 7px'
    name.appendChild(badge)
    item.appendChild(name)
    item.appendChild(el('div', 'pi-sub', p.hasOmnife ? 'omnife submodule' : p.path.split('/').slice(-2, -1)[0] || ''))
    item.onclick = () => selectProject(p)
    list.appendChild(item)
  }
}

async function selectProject(p) {
  state.selected = p
  state.selectedBranches = []
  state.selectedLocales = []
  state.branchFilter = ''
  state.info = null
  renderProjectList()
  $('emptyState').classList.add('hidden')
  $('projectView').classList.remove('hidden')
  $('projName').textContent = p.name
  const typeBadge = $('projType')
  typeBadge.textContent = p.type
  typeBadge.className = 'badge ' + p.type
  $('projCurrent').textContent = 'yukleniyor...'
  $('fetchStatus').textContent = ''
  toggleTypeFields(p)
  setNodeSelect()
  await loadInfo()
}

function toggleTypeFields(p) {
  const isNext = p.type === 'next'
  $('strictField').classList.toggle('hidden', !isNext)
  const showSm = isNext && p.hasOmnife
  $('smField').classList.toggle('hidden', !showSm)
}

function setNodeSelect() {
  const cfg = state.config || {}
  const map = cfg.nodeVersions || {}
  const v = map[state.selected.path] || cfg.defaultNodeVersion || '22'
  const sel = $('nodeSelect')
  let found = false
  for (const o of sel.options) { if (o.value === v) { found = true; break } }
  if (!found) {
    const o = document.createElement('option')
    o.value = v
    o.textContent = v
    sel.appendChild(o)
  }
  sel.value = v
}

async function loadInfo() {
  const p = state.selected
  const info = await appApi.gitInfo(p.path)
  if (info.error) {
    $('projCurrent').textContent = 'git hatasi'
    return
  }
  state.info = info
  $('projCurrent').textContent = info.currentBranch
  renderCheckoutBar()
  renderDevSection()
  renderMasterSection()
  renderBranchSection()
  renderLocaleSection()
  renderTags()
  renderPublish()
  updatePreview()
}

function selectedRemotes() {
  return Array.from($('tagRemotes').querySelectorAll('input[type="checkbox"]'))
    .filter((c) => c.checked)
    .map((c) => c.value)
}

function renderPublish() {
  const info = state.info
  $('pubDevName').textContent = info.currentBranch || '—'
  $('tagInput').value = info.suggestedTag || ''
  const box = $('tagRemotes')
  box.innerHTML = ''
  const remotes = info.remotes || []
  if (!remotes.length) {
    box.appendChild(el('span', 'muted', '(remote yok)'))
    return
  }
  box.appendChild(el('span', 'muted', 'push →'))
  for (const r of remotes) {
    const wrap = el('label', 'rmt-check')
    wrap.title = r.url || ''
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.value = r.name
    cb.checked = true
    wrap.appendChild(cb)
    wrap.appendChild(document.createTextNode(' ' + r.name))
    if (r.host) wrap.appendChild(el('span', 'rmt-host', r.host))
    box.appendChild(wrap)
  }
}

function openConsole(title) {
  $('consoleOut').innerHTML = ''
  $('consolePanel').classList.remove('hidden')
  $('stopBtn').disabled = false
  $('consoleTitle').textContent = title
}

async function doPushDev() {
  if (!state.selected || !state.info) return
  const branch = state.info.currentBranch
  if (!branch || branch === 'HEAD') { alert('Geçerli bir branch üzerinde değilsin.'); return }
  if (!confirm("'" + branch + "' branch'i origin'e push edilecek.\nOnaylıyor musun?")) return
  openConsole('Push: ' + branch + ' → origin')
  await appApi.pushBranch(state.selected.path, branch)
}

async function doTagPush() {
  if (!state.selected || !state.info) return
  const tag = $('tagInput').value.trim()
  if (!tag) { alert('Tag adı boş olamaz.'); return }
  const remotes = selectedRemotes()
  if (!remotes.length) { alert('En az bir remote seç.'); return }
  const branch = state.info.currentBranch
  if (!confirm("'" + tag + "' tag'i '" + branch + "' üzerinde oluşturulup şu remote'lara push edilecek:\n" + remotes.join(', ') + "\n\nOnaylıyor musun?")) return
  openConsole('Tag: ' + tag + ' → ' + remotes.join(', '))
  await appApi.tagPush(state.selected.path, tag, remotes)
}

function renderCheckoutBar() {
  const info = state.info
  const sel = $('checkoutSelect')
  sel.innerHTML = ''
  const names = info.allBranchNames.slice()
  if (info.currentBranch && names.indexOf(info.currentBranch) === -1) names.unshift(info.currentBranch)
  for (const n of names) {
    const o = el('option', null, n)
    o.value = n
    if (n === info.currentBranch) o.selected = true
    sel.appendChild(o)
  }
  const toMaster = $('toMasterBtn')
  if (info.currentBranch && info.currentBranch !== info.defaultMaster) {
    toMaster.textContent = '⤳ ' + info.defaultMaster + "'e geç"
    toMaster.classList.remove('hidden')
  } else {
    toMaster.classList.add('hidden')
  }
  $('checkoutStatus').textContent = ''
}

async function doCheckout(branch) {
  if (!branch || !state.selected) return
  const status = $('checkoutStatus')
  status.textContent = "'" + branch + "' geçiliyor..."
  const res = await appApi.checkout(state.selected.path, branch)
  if (res.code === 0) {
    status.textContent = '✓ geçildi'
    await loadInfo()
  } else {
    const msg = (res.stderr || res.stdout || '').split('\n').filter(Boolean).slice(-2).join(' ')
    status.textContent = '✕ ' + (msg || 'checkout hatası')
  }
}

function renderDevSection() {
  const info = state.info
  $('devInput').value = info.suggestedDev
  $('uedCheck').checked = false
  const sel = $('existingDevSelect')
  sel.innerHTML = '<option value="">— mevcut dev seç —</option>'
  for (const d of info.devBranches) {
    const o = el('option', null, d.name + (d.date ? '  (' + d.date + ')' : ''))
    o.value = d.name
    sel.appendChild(o)
  }
}

function renderMasterSection() {
  const info = state.info
  const pm = $('pmSelect')
  pm.innerHTML = ''
  const masterOpts = info.masterCandidates.length ? info.masterCandidates.slice() : ['master', 'main']
  if (masterOpts.indexOf(info.defaultMaster) === -1) masterOpts.unshift(info.defaultMaster)
  for (const m of masterOpts) {
    const o = el('option', null, m)
    o.value = m
    if (m === info.defaultMaster) o.selected = true
    pm.appendChild(o)
  }
  const sm = $('smSelect')
  sm.innerHTML = ''
  for (const m of masterOpts) {
    const o = el('option', null, m)
    o.value = m
    if (m === info.defaultMaster) o.selected = true
    sm.appendChild(o)
  }
}

function renderBranchSection() {
  renderSelectedBranches()
  renderBranchOptions()
}

function renderSelectedBranches() {
  const box = $('selectedBranches')
  box.innerHTML = ''
  if (!state.selectedBranches.length) {
    box.appendChild(el('span', 'muted', 'Henüz branch seçilmedi.'))
    return
  }
  for (const b of state.selectedBranches) {
    const chip = el('span', 'chip selected')
    chip.appendChild(el('span', null, b))
    const x = el('span', 'x', '✕')
    x.onclick = () => { toggleBranch(b) }
    chip.appendChild(x)
    box.appendChild(chip)
  }
}

function renderBranchOptions() {
  const list = $('branchOptions')
  list.innerHTML = ''
  const f = state.branchFilter.toLowerCase()
  const opts = state.info.normalBranches.filter((b) => !f || b.name.toLowerCase().indexOf(f) !== -1)
  for (const b of opts.slice(0, 60)) {
    const row = el('div', 'option')
    if (state.selectedBranches.indexOf(b.name) !== -1) row.classList.add('picked')
    row.appendChild(el('span', null, b.name))
    row.appendChild(el('span', 'o-date', b.date || ''))
    row.onclick = () => toggleBranch(b.name)
    list.appendChild(row)
  }
  if (!opts.length) list.appendChild(el('div', 'muted', 'Eşleşen branch yok. Enter ile elle ekleyebilirsin.'))
}

function toggleBranch(name) {
  const i = state.selectedBranches.indexOf(name)
  if (i === -1) state.selectedBranches.push(name)
  else state.selectedBranches.splice(i, 1)
  renderSelectedBranches()
  renderBranchOptions()
  updatePreview()
}

function toggleLocale(loc) {
  const i = state.selectedLocales.indexOf(loc)
  if (i === -1) state.selectedLocales.push(loc)
  else state.selectedLocales.splice(i, 1)
  renderLocaleSection()
  updatePreview()
}

function renderLocaleSection() {
  const detected = (state.info && state.info.detectedLocales) || []
  const det = $('localeDetected')
  if (detected.length) det.textContent = 'Projede bulunan diller: ' + detected.join(', ') + '  — tıklayarak seç'
  else det.textContent = 'Projede locale/ klasörü bulunamadı; gerekirse elle dil kodu ekle.'

  const box = $('localeChips')
  box.innerHTML = ''
  const base = []
  for (const l of detected) if (base.indexOf(l) === -1) base.push(l)
  for (const l of COMMON_LOCALES) if (base.indexOf(l) === -1) base.push(l)

  for (const loc of base) {
    const isDet = detected.indexOf(loc) !== -1
    const on = state.selectedLocales.indexOf(loc) !== -1
    const chip = el('span', 'chip' + (on ? ' on' : '') + (isDet ? ' detected' : ''), loc)
    chip.onclick = () => toggleLocale(loc)
    box.appendChild(chip)
  }
  for (const loc of state.selectedLocales) {
    if (base.indexOf(loc) !== -1) continue
    const chip = el('span', 'chip on')
    chip.appendChild(el('span', null, loc))
    const x = el('span', 'x', '✕')
    x.onclick = () => {
      state.selectedLocales = state.selectedLocales.filter((l) => l !== loc)
      renderLocaleSection()
      updatePreview()
    }
    chip.appendChild(x)
    box.appendChild(chip)
  }
}

function renderTags() {
  const box = $('tagList')
  box.innerHTML = ''
  if (!state.info.tags.length) {
    box.appendChild(el('div', 'muted', 'Tag yok.'))
    return
  }
  for (const t of state.info.tags) {
    const row = el('div', 'tag-row')
    row.appendChild(el('span', null, t.name))
    row.appendChild(el('span', 't-date', t.date || ''))
    box.appendChild(row)
  }
}

function collectParams() {
  return {
    projectPath: state.selected.path,
    projectName: state.selected.name,
    type: state.selected.type,
    pm: $('pmSelect').value,
    sm: $('smField').classList.contains('hidden') ? '' : $('smSelect').value,
    branches: state.selectedBranches,
    dev: $('devInput').value.trim(),
    useExistingDev: $('uedCheck').checked,
    locales: state.selectedLocales,
    npm: $('npmCheck').checked,
    strict: $('strictCheck').checked,
    nodeVersion: $('nodeSelect').value
  }
}

async function updatePreview() {
  if (!state.selected || !state.info) return
  const res = await appApi.preview(collectParams())
  $('cmdPreview').textContent = res.command
}

function bindStatic() {
  $('projectSearch').oninput = (e) => {
    const f = e.target.value.toLowerCase()
    state.filtered = state.projects.filter((p) => p.name.toLowerCase().indexOf(f) !== -1)
    renderProjectList()
  }
  $('refreshProjects').onclick = loadProjects

  $('branchSearch').oninput = (e) => { state.branchFilter = e.target.value; renderBranchOptions() }
  $('branchSearch').onkeydown = (e) => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim()
      if (v && state.selectedBranches.indexOf(v) === -1) {
        state.selectedBranches.push(v)
        renderSelectedBranches()
        renderBranchOptions()
        updatePreview()
      }
      e.target.value = ''
      state.branchFilter = ''
      renderBranchOptions()
    }
  }

  $('localeInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim()
      if (v && state.selectedLocales.indexOf(v) === -1) {
        state.selectedLocales.push(v)
        renderLocaleSection()
        updatePreview()
      }
      e.target.value = ''
    }
  }

  $('devInput').oninput = () => {
    const v = $('devInput').value.trim()
    const exists = state.info && state.info.devBranches.some((d) => d.name === v)
    $('uedCheck').checked = !!exists
    updatePreview()
  }
  $('existingDevSelect').onchange = (e) => {
    if (e.target.value) {
      $('devInput').value = e.target.value
      $('uedCheck').checked = true
      updatePreview()
    }
  }
  $('suggestDevBtn').onclick = () => {
    if (!state.info) return
    $('devInput').value = state.info.suggestedDev
    $('uedCheck').checked = false
    $('existingDevSelect').value = ''
    updatePreview()
  }
  $('uedCheck').onchange = updatePreview
  $('pmSelect').onchange = updatePreview
  $('smSelect').onchange = updatePreview
  $('npmCheck').onchange = updatePreview
  $('strictCheck').onchange = updatePreview

  $('fetchBtn').onclick = doFetch
  $('checkoutBtn').onclick = () => doCheckout($('checkoutSelect').value)
  $('toMasterBtn').onclick = () => { if (state.info) doCheckout(state.info.defaultMaster) }
  $('pushDevBtn').onclick = doPushDev
  $('tagPushBtn').onclick = doTagPush
  $('nodeSelect').onchange = async () => {
    if (!state.selected) return
    if (!state.config.nodeVersions) state.config.nodeVersions = {}
    state.config.nodeVersions[state.selected.path] = $('nodeSelect').value
    state.config = await appApi.setConfig(state.config)
  }
  $('copyCmdBtn').onclick = () => appApi.copy($('cmdPreview').textContent)
  $('runBtn').onclick = doRun

  $('settingsBtn').onclick = openSettings
  $('cancelSettings').onclick = () => $('settingsModal').classList.add('hidden')
  $('saveSettings').onclick = saveSettings
  $('pickRoot').onclick = async () => { const d = await appApi.pickDir($('cfgRoot').value); if (d) $('cfgRoot').value = d }
  $('pickOmni').onclick = async () => { const d = await appApi.pickDir($('cfgOmni').value); if (d) $('cfgOmni').value = d }

  $('stopBtn').onclick = () => appApi.stopBuild()
  $('closeConsole').onclick = () => $('consolePanel').classList.add('hidden')
}

function lastLine(r) {
  const t = ((r && r.stdout) || '') + '\n' + ((r && r.stderr) || '')
  return t.split('\n').filter(Boolean).slice(-1)[0] || ''
}

async function doFetch() {
  if (!state.selected) return
  const btn = $('fetchBtn')
  btn.disabled = true
  $('fetchStatus').textContent = 'fetch + pull çalışıyor...'
  const res = await appApi.fetch(state.selected.path)
  if (res.fetch.code !== 0) {
    $('fetchStatus').textContent = 'fetch hatası: ' + (lastLine(res.fetch) || 'exit ' + res.fetch.code)
  } else if (!res.hasUpstream) {
    $('fetchStatus').textContent = 'fetch ✓ · pull yok (' + (res.branch || '?') + ' upstream tanımsız)'
  } else if (res.pull && res.pull.code === 0) {
    const pl = lastLine(res.pull)
    $('fetchStatus').textContent = /up to date/i.test(pl) ? 'güncel ✓ (zaten ileride)' : 'güncellendi ✓ (pull)'
  } else {
    $('fetchStatus').textContent = 'fetch ✓ · pull yapılamadı: ' + (lastLine(res.pull) || 'ff mümkün değil')
  }
  btn.disabled = false
  await loadInfo()
}

function validate(params) {
  if (!params.dev) return 'Dev branch adı boş olamaz.'
  if (!params.useExistingDev && !params.branches.length) {
    return 'Yeni dev branch için en az bir merge branch seç (-b).'
  }
  return null
}

function appendConsole(text, cls) {
  const out = $('consoleOut')
  const span = el('span', cls)
  span.textContent = text
  out.appendChild(span)
  out.scrollTop = out.scrollHeight
  requestAnimationFrame(() => { out.scrollTop = out.scrollHeight })
}

let buildBound = false
function bindBuildEvents() {
  if (buildBound) return
  buildBound = true
  appApi.onBuildData((d) => {
    const cls = d.stream === 'cmd' ? 'l-cmd' : 'l-out'
    const prefix = d.stream === 'cmd' ? '$ ' : ''
    appendConsole(prefix + d.text, cls)
  })
  appApi.onBuildEnd((d) => {
    $('stopBtn').disabled = true
    if (d.code === 0) {
      appendConsole('\n✓ Tamamlandı (exit 0)\n', 'l-end-ok')
      if (state.selected) loadInfo()
    } else {
      appendConsole('\n✕ Hata / iptal (exit ' + d.code + ')\n', 'l-end-fail')
    }
  })
}

async function doRun() {
  const params = collectParams()
  const err = validate(params)
  if (err) { alert(err); return }
  openConsole('Build: ' + params.projectName + ' → ' + params.dev)
  await appApi.runBuild(params)
}

async function openSettings() {
  state.config = await appApi.getConfig()
  $('cfgRoot').value = state.config.projectsRoot || ''
  $('cfgOmni').value = state.config.omniBuildPath || ''
  $('cfgPython').value = state.config.pythonPath || 'python'
  $('cfgPrelude').value = state.config.shellPrelude || ''
  $('settingsModal').classList.remove('hidden')
}

async function saveSettings() {
  const cfg = {
    projectsRoot: $('cfgRoot').value.trim(),
    omniBuildPath: $('cfgOmni').value.trim(),
    pythonPath: $('cfgPython').value.trim() || 'python',
    shellPrelude: $('cfgPrelude').value.trim()
  }
  state.config = await appApi.setConfig(cfg)
  $('settingsModal').classList.add('hidden')
  await loadProjects()
  if (state.selected && state.info) updatePreview()
}

init()
