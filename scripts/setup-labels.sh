#!/usr/bin/env bash
# ブックマーク運用で使うラベルを作成・更新する（何度実行しても安全）
set -euo pipefail

gh label create inbox         --color FBCA04 --description "未整理のURL" --force
gh label create frontend      --color 1D76DB --description "bookmarks/frontend.md へ追加" --force
gh label create backend       --color 0E8A16 --description "bookmarks/backend.md へ追加" --force
gh label create infra         --color 5319E7 --description "bookmarks/infra.md へ追加" --force
gh label create ai            --color D93F0B --description "bookmarks/ai.md へ追加" --force
gh label create weekly-review --color C5DEF5 --description "週次inbox整理" --force
