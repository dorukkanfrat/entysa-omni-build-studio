#!/bin/zsh
DIR="$(cd "$(dirname "$0")" && pwd)"

[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"

export PYENV_ROOT="$HOME/.pyenv"
[ -d "$PYENV_ROOT/bin" ] && export PATH="$PYENV_ROOT/bin:$PATH"
command -v pyenv >/dev/null 2>&1 && eval "$(pyenv init -)" >/dev/null 2>&1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1

cd "$DIR"
if [ ! -d node_modules ]; then
  echo "Bagimliliklar kuruluyor, lutfen bekle..."
  npm install
fi
echo "Omni Launcher baslatiliyor..."
npm start
