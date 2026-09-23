# ブックマーク索引

| ファイル | 対象 |
| --- | --- |
| [inbox.md](inbox.md) | PC からまとめて貼る場所（push すると Issue に自動変換される） |
| [frontend.md](frontend.md) | HTML/CSS、JavaScript/TypeScript、React などのフレームワーク、UI/UX、ブラウザ |
| [backend.md](backend.md) | サーバーサイド言語、API設計、データベース、アーキテクチャ |
| [infra.md](infra.md) | クラウド（AWS など）、コンテナ、CI/CD、IaC、監視、セキュリティ運用 |
| [ai.md](ai.md) | LLM、機械学習、AIを使った開発ツール |

## 記載形式

```markdown
- [記事タイトル](URL) - 保存日
  - 一言コメント #タグ
```

## 運用

- 新しいURLは GitHub Issue（スマホ・Slack・PC）または `inbox.md`（PC）に入れる
  - `inbox.md` の項目は push 時に Issue へ自動変換されるため、未整理のURLはすべて Issue に集まる
- 週1回、`inbox` ラベルの Issue にカテゴリラベルを付けて整理する（該当ファイルへ自動追記される）
- どのカテゴリにも当てはまらないものが増えてきたら、新しいカテゴリファイルを追加してこの表に追記する
  （Issue から自動追記したい場合は `scripts/bookmark-from-issue.mjs` の `CATEGORIES` とラベルも追加する）
- タグで横断的に探す：`grep -rn "#docker" bookmarks/`
