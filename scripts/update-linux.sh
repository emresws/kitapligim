#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

if [[ "$(git branch --show-current)" != main ]]; then
    echo "Güncelleme için main dalında olmalısın." >&2
    exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "İzlenen dosyalarda yerel değişiklik var. Önce bunları incele." >&2
    exit 1
fi

docker compose version >/dev/null
git pull --ff-only origin main
docker compose up -d --build --wait
docker compose ps kitaplik
