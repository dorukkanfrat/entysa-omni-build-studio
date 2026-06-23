const lib = require('./lib')
const os = require('os')
const path = require('path')

async function main() {
  const cfg = lib.defaultConfig()
  console.log('projectsRoot:', cfg.projectsRoot)
  console.log('omniBuildPath:', cfg.omniBuildPath)

  const projects = lib.discoverProjects(cfg.projectsRoot)
  console.log('\n=== KESFEDILEN PROJELER (' + projects.length + ') ===')
  for (const p of projects) console.log('  ' + p.type.padEnd(7) + ' ' + p.name + (p.hasOmnife ? '  [omnife]' : ''))

  const ua = projects.find((p) => p.name === 'underarmour')
  if (ua) {
    console.log('\n=== underarmour gitInfo ===')
    const info = await lib.gitInfo(ua.path)
    console.log('current:', info.currentBranch)
    console.log('suggestedDev:', info.suggestedDev)
    console.log('masterCandidates:', info.masterCandidates.join(', '))
    console.log('defaultMaster:', info.defaultMaster)
    console.log('dev branch sayisi:', info.devBranches.length, '-> en yeni 3:', info.devBranches.slice(0, 3).map((d) => d.name).join(', '))
    console.log('normal branch sayisi:', info.normalBranches.length, '-> ilk 5:', info.normalBranches.slice(0, 5).map((b) => b.name).join(', '))
    console.log('tag sayisi:', info.tags.length, '-> en yeni 3:', info.tags.slice(0, 3).map((t) => t.name + '(' + t.date + ')').join(', '))

    const cmd = lib.buildCommand({
      type: 'django',
      projectPath: ua.path,
      pm: 'master',
      branches: ['joyalty-refactor'],
      dev: info.suggestedDev,
      useExistingDev: false,
      locales: [],
      npm: false
    }, cfg)
    console.log('\n--- uretilen komut (django) ---')
    console.log(cmd.command)
    console.log('cwd:', cmd.cwd)
  }

  const nx = projects.find((p) => p.type === 'next')
  if (nx) {
    console.log('\n=== ' + nx.name + ' (next) gitInfo ===')
    const info = await lib.gitInfo(nx.path)
    console.log('current:', info.currentBranch)
    console.log('suggestedDev:', info.suggestedDev)
    console.log('defaultMaster:', info.defaultMaster)
    const cmd = lib.buildCommand({
      type: 'next',
      projectPath: nx.path,
      pm: info.defaultMaster,
      sm: '',
      branches: ['ornek-branch'],
      dev: info.suggestedDev,
      useExistingDev: false,
      locales: ['tr', 'en'],
      npm: false,
      strict: true
    }, cfg)
    console.log('--- uretilen komut (next) ---')
    console.log(cmd.command)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
