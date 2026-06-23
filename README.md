# Omni Launcher

`omni_build/django_run.py` ve `next_run.py` scriptleri için masaüstü önyüz (Electron).
Projeyi seçersin, tipini (django / next) otomatik anlar, güncel dev branch'i / normal branch'leri / tag'leri gösterir, merge edilecekleri seçersin, komutu kurar ve çalıştırıp çıktıyı canlı gösterir.

## Çalıştırma

En kolayı: **`Baslat.command`** dosyasına çift tıkla. (İlk açılışta macOS "izin" sorabilir: Sağ tık → Aç.)

Terminalden:

```bash
cd ~/Desktop/projects/omni-launcher
npm install      # ilk sefer
npm start
```

> Not: `Baslat.command` / terminal üzerinden açıldığında uygulama senin shell ortamını (nvm + pyenv) miras alır, böylece `python` / `yarn` / `git` doğru sürümlerle bulunur.

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

## Paketleme (sonraki adım)

Mac `.dmg`:

```bash
npm run dist:mac
```

Windows `.exe` (Windows makinede veya CI'da):

```bash
npm run dist:win
```

> `.app` Finder'dan çift tıkla açıldığında shell ortamını miras almaz; o senaryoda Ayarlar'daki "Shell ön komutu" alanına PATH/venv satırını ekle.
