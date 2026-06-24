# Omni Launcher

`omni_build/django_run.py` ve `next_run.py` scriptleri için masaüstü önyüz (Electron).
Projeyi seçersin, tipini (django / next) otomatik anlar, güncel dev branch'i / normal branch'leri / tag'leri gösterir, merge edilecekleri seçersin, komutu kurar ve çalıştırıp çıktıyı canlı gösterir.

## Çalıştırma

`projects/omni-launcher` klasöründeki **`Baslat.command`** dosyasına çift tıkla. (İlk açılışta macOS "izin" sorabilir: Sağ tık → Aç.)

Terminalden:

```bash
cd ~/Desktop/projects/omni-launcher
npm install      # ilk sefer
npm start
```

> `Baslat.command` açılırken homebrew + pyenv + nvm (Node 22) ortamını yükler; böylece `git` / `python` / `node` / `yarn` doğru sürümlerle bulunur ve build sorunsuz çalışır.
>
> **Not:** `.dmg`/`.app` olarak paketleme önerilmez — Finder'dan açılan `.app` terminal ortamını (PATH) miras almadığı için build adımı `python`/`yarn`'ı bulamaz. Bu araç klasörden `Baslat.command` ile çalıştırılmak üzere tasarlandı.

## Ne yapar

- **Otomatik tespit**: `~/Desktop/projects` altındaki git repolarını tarar.
  - django = `manage.py` + `templates/`
  - next = `package.json` + `next.config.*`
- **Dev branch**: `<proje>_dev_<N>` desenini okur, bir sonraki numarayı önerir (ör. `underarmour_dev_562`). Var olan bir dev'i seçersen otomatik `-ued` ekler.
- **Branch seçimi**: dev olmayan remote branch'leri arayıp çoklu seçersin (`-b`). Listede yoksa Enter ile elle ekleyebilirsin.
- **Master / submodule**: `-pm` ve (next + omnife ise) `-sm` seçimi. django'da `-sm` zaten script tarafından yok sayıldığı için gönderilmez.
- **Locale (`-l`)**, **npm ile build (`-npm`)**, **strict (`-strict`, sadece next)** seçenekleri.
- **Komut önizleme**: çalıştırmadan önce tam komutu gösterir, kopyalanabilir.
- **Fetch**: seçili projede `git fetch --all --tags --prune` çalıştırır, listeyi tazeler.
- **Çalıştır**: scripti login-shell içinden çalıştırır, stdout/stderr canlı akar, **Durdur** ile iptal edilir.

## Ayarlar (sağ üst ⚙)

- Projeler kök dizini (varsayılan `~/Desktop/projects`)
- `omni_build` yolu
- `python` komutu
- Shell ön komutu — gerekiyorsa venv aktive etmek için, ör. `source ~/Desktop/projects/venv/bin/activate`

Ayarlar `~/Library/Application Support/omni-launcher/config.json` içinde tutulur.

## Paketleme (.dmg)

`Paketle.command`'a çift tıkla (veya terminalden çalıştır). Bu script:
1. uygulamayı paketler (`electron-builder --mac --dir`),
2. **ad-hoc imzalar** (`codesign --deep --force --sign -`) — imzasız app indirilince macOS "hasar görmüş" der, bu adım onu engeller,
3. `dist/Omni Launcher-<versiyon>-arm64.dmg` üretir.

Sonra GitHub Release'e yüklemek için script'in sonunda yazan `gh release upload ...` komutunu çalıştır.

### dmg'yi kuranlar için (önemli)
İmza ad-hoc (Apple Developer sertifikası yok) olduğundan, indirilen `.app` ilk açılışta macOS karantinasına takılır. Kuran kişi bir kez şunu çalıştırmalı:

```bash
xattr -dr com.apple.quarantine "/Applications/Omni Launcher.app"
```

Sonra normal açılır. (Alternatif: araç klasörden `Baslat.command` ile de çalışır, bu durumda imza/karantina derdi olmaz.)
