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
   - PCから：Issue を作成する、または `bookmarks/inbox.md` に追記して push する（Actions が自動で Issue に変換する）
2. 週1回、inbox を整理する（毎週月曜に「週次inbox整理」Issue が自動で作られる）
   - カテゴリラベル（`frontend` / `backend` / `infra` / `ai`）を付けると、該当ファイルへ自動で追記されて Issue がクローズされる
   - コメントに `#infra` のようなカテゴリ名のタグを書いておくと、そのラベルが候補として付く。正しければ `inbox` ラベルを外すだけで追記される（詳細は [docs/url-collection.md](docs/url-collection.md#タグでカテゴリの候補を付ける)）
   - 不要なものは「Close as not planned」で閉じる

スマホ・Slackからの追加方法の比較と設定手順は [docs/url-collection.md](docs/url-collection.md) にまとめています。

### ターミナルから1行で登録する（bm コマンド）

`gh` で Issue を作れば、Web から作った場合と同じ流れで処理されます。`~/.zshrc` に次の関数を追加すると `bm` で登録できます。

```zsh
# tech-lab ブックマーク登録: bm <URL> [コメント #タグ] [カテゴリ]
# カテゴリ省略時は inbox に入る。frontend/backend/infra/ai を指定すると即座にカテゴリファイルへ追記される
bm() {
  local url="$1" note="${2:-}" label="${3:-inbox}"
  if [[ -z "$url" || "$url" != http*://* ]]; then
    echo "使い方: bm <URL> [コメント #タグ] [inbox|frontend|backend|infra|ai]" >&2
    return 1
  fi
  if [[ ! "$label" =~ ^(inbox|frontend|backend|infra|ai)$ ]]; then
    echo "カテゴリは inbox / frontend / backend / infra / ai のいずれかを指定してください: $label" >&2
    return 1
  fi
  # タイトルは Actions がページタイトルに置き換える（URL は本文に残る）
  gh issue create -R kawafuchieirin/dev-garden -t "$url" -b "URL: $url
コメント: $note" -l "$label"
}
```

```sh
bm https://example.com/a                                   # inbox に入れる（週次で仕分け）
bm https://example.com/b "compose の watch が便利 #docker"   # コメント・タグ付き
bm https://example.com/d "watch が便利 #infra #docker"        # infra を候補にして inbox に入れる
bm https://example.com/c "Terraform 入門" infra              # infra.md に直接追記
```

- 記事タイトルは自動で取得されるため、URL だけ渡せばよい（Issue のタイトルも数十秒後にページタイトルへ置き換わり、URL は本文から開ける）
- カテゴリを指定すると inbox を経由せず、数十秒後に `bookmarks/<カテゴリ>.md` へ追記されて Issue がクローズされる

### プロジェクトボード

GitHub Projects の [tech-lab](https://github.com/users/kawafuchieirin/projects/4) で、ブックマーク・記事・検証の進み具合を1つのボードで管理します。

| フィールド | 値 | 使い方 |
| --- | --- | --- |
| Status | Todo / In Progress / Done | 未着手・作業中・完了 |
| 種別 | ブックマーク / 記事 / 検証 | 何の作業かを区別する |

- `inbox` ラベルの Issue は自動でボードに追加される（Auto-add ワークフロー）
- 記事や検証に取りかかるときは Issue を作り、種別を「記事」「検証」にして Status で進み具合を管理する
  - 作成時に `article` / `experiment` ラベルを付ける（ラベルなしの Issue には `inbox` が自動で付くため）
- 設定手順は [docs/url-collection.md](docs/url-collection.md#5-プロジェクトボード) を参照

## 開発環境

ランタイムは [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
pnpm install
pnpm lint:text   # 記事の textlint チェック
pnpm test        # scripts/ のテスト
```

PR と main への push では、GitHub Actions で textlint とテストが自動実行されます。
