# tech-lab

技術記事の執筆、気になった記事のURL収集、検証コードの管理を1か所にまとめる個人リポジトリです。

## ディレクトリ構成

```
tech-lab/
├── README.md              # このファイル
├── articles/
│   ├── drafts/            # 下書き
│   └── published/         # 公開済みの記事
├── bookmarks/
│   ├── README.md          # カテゴリの索引
│   ├── inbox.md           # 未整理のURLを一時的に放り込む場所
│   ├── frontend.md
│   ├── backend.md
│   ├── infra.md
│   └── ai.md
├── experiments/           # 検証ごとにディレクトリを作成
├── templates/
│   ├── article.md         # 記事のひな形
│   ├── experiment.md      # 検証READMEのひな形
│   └── bookmark.md        # ブックマーク記載のひな形
├── docs/
│   └── url-collection.md  # スマホ・SlackからのURL収集の設定手順
├── scripts/               # GitHub Actions から呼ぶスクリプト
└── .github/               # Issueテンプレート・ワークフロー
```

| ディレクトリ | 用途 |
| --- | --- |
| `articles/drafts/` | 執筆中の記事。公開したら `published/` へ `git mv` する |
| `articles/published/` | 公開済みの記事。frontmatter の `published_url` に公開先URLを記載する |
| `bookmarks/` | 気になった記事のURL集。カテゴリごとに1ファイル |
| `experiments/` | 検証コード。1検証 = 1ディレクトリで、直下に `README.md` を置く |
| `templates/` | 各種ひな形。新規作成時にコピーして使う |

## 運用ルール

### 命名規則

記事ファイルと検証ディレクトリは「日付-スラッグ」形式で命名します。

- 記事：`articles/drafts/2026-09-23-docker-compose-tips.md`
- 検証：`experiments/2026-09-23-bun-vs-node-startup/`

スラッグは英小文字・数字・ハイフンのみを使います。日付は作成日です（公開時に変える必要はありません）。

### 記事を書く

```sh
cp templates/article.md articles/drafts/2026-09-23-docker-compose-tips.md
# 執筆 → textlint でチェック
pnpm lint:text
# 公開したら published へ移動し、frontmatter の status と published_url を更新
git mv articles/drafts/2026-09-23-docker-compose-tips.md articles/published/
```

### 検証する

```sh
mkdir experiments/2026-09-23-bun-vs-node-startup
cp templates/experiment.md experiments/2026-09-23-bun-vs-node-startup/README.md
```

検証ごとに依存関係を閉じ込めます（`package.json` や `.mise.toml` は検証ディレクトリ内に置く）。
結論が出たら README の「結論」を必ず埋めます。記事化する場合は記事から検証ディレクトリへリンクします。

### ブックマークを保存する

形式は次のとおりです（`templates/bookmark.md` 参照）。

```markdown
- [記事タイトル](URL) - 保存日
  - 一言コメント #タグ
```

1. 新しいURLはまず inbox に入れる
   - スマホ・Slackから：GitHub Issue を作成する（`inbox` ラベルが自動付与される）
   - PCから：`bookmarks/inbox.md` に直接追記する、または Issue を作成する
2. 週1回、inbox を整理する（毎週月曜に「週次inbox整理」Issue が自動で作られる）
   - Issue：カテゴリラベル（`frontend` / `backend` / `infra` / `ai`）を付けると、該当ファイルへ自動で追記されて Issue がクローズされる
   - Issue：不要なものは「Close as not planned」で閉じる
   - `inbox.md`：該当するカテゴリファイルへ手で移し、inbox からは削除する

スマホ・Slackからの追加方法の比較と設定手順は [docs/url-collection.md](docs/url-collection.md) にまとめています。

## 開発環境

ランタイムは [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
pnpm install
pnpm lint:text   # 記事の textlint チェック
pnpm test        # scripts/ のテスト
```

`articles/` 配下を変更した PR では、GitHub Actions で textlint が自動実行されます。
