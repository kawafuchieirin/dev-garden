# ブックマーク索引

| ファイル | 対象 |
| --- | --- |
| [inbox.md](inbox.md) | 未整理のURL（週1回カテゴリファイルへ移す） |
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

- 新しいURLは GitHub Issue（スマホ・Slack）または `inbox.md`（PC）に入れる
- 週1回、inbox を整理する
  - Issue はカテゴリラベルを付けると該当ファイルへ自動追記される
  - `inbox.md` の項目は手でカテゴリファイルへ移す
- どのカテゴリにも当てはまらないものが増えてきたら、新しいカテゴリファイルを追加してこの表に追記する
  （Issue から自動追記したい場合は `scripts/bookmark-from-issue.mjs` の `CATEGORIES` とラベルも追加する）
- タグで横断的に探す：`grep -rn "#docker" bookmarks/`
