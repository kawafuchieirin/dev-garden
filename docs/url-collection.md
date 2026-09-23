# URL収集の運用

スマホやSlackから手軽に inbox へURLを追加するための仕組みと、その設定手順です。

## 方式の比較

| 観点 | A. GitHub Issues を inbox にする | B. iPhoneショートカット → API で inbox.md に追記 | C. Slack の GitHub アプリで Issue 化 |
| --- | --- | --- | --- |
| 追加の手軽さ | ◯ GitHub アプリ・Web から追加できる。単体だと入力の手数はやや多い | ◎ 共有シートから1タップ（X・YouTube・Safari から共通で使える） | ◎ メッセージのメニューから Issue 化できる |
| 整理のしやすさ | ◎ ラベル・検索・クローズで状態を管理できる。スマホからも整理できる | △ ファイルを手で編集する必要がある | ◎ Issue になるので A と同じ |
| 実装の難しさ | 低（Issue 作成 API は1リクエスト） | 高（ファイル取得 → Base64 デコード → 追記 → SHA 付きで PUT。ショートカットで組むのは煩雑） | 低（アプリを入れるだけ） |
| 競合・失敗時 | 起きない（1件 = 1 Issue） | 同時追記で SHA 不一致になり失敗する。1件ごとにコミットが増え履歴が汚れる | 起きない |
| トークンの権限 | Issues の書き込みのみ | Contents の書き込み（リポジトリのコードを書き換えられる権限） | Slack アプリと GitHub アカウントの連携のみ（トークン管理不要） |
| 前提条件 | なし | iPhone | GitHub アプリをインストールできる Slack ワークスペース |

### おすすめ：Issues を唯一の inbox にし、入口を「ショートカット」と「Slack」の2つにする

A を土台にして、B は「inbox.md に追記」ではなく **「Issue を作成」** するショートカットとして使い、Slack からは C を使う構成がおすすめです。

- **入口がどこでも、行き先は Issue の1か所**になる。散らばる問題そのものを解決できる
- ショートカットの処理が Issue 作成の1リクエストで済み、壊れにくい。トークンの権限も Issues に絞れる
- 整理は「ラベルを付けるだけ」。このリポジトリでは GitHub Actions がカテゴリファイルへの追記とクローズを自動で行う
- `bookmarks/inbox.md` は PC で作業中にまとめて貼る用途として残す。push すると Actions が Issue に変換するので、整理はすべて Issue で行える

```
iPhone（Safari / X / YouTube の共有シート）── ショートカット ──┐
Slack（メッセージのメニュー）──────── GitHub アプリ ─────────┼──▶ Issue（inbox ラベル）
PC / GitHub モバイルアプリ ─────── Issue フォーム ───────────┤            │
PC（bookmarks/inbox.md に追記して push）── Actions ────────────┘            │
                                                         カテゴリラベルを付ける（週1回）
                                                                          ▼
                                                  Actions が bookmarks/<category>.md に追記して Issue をクローズ
```

## このリポジトリに入っている自動化

| ファイル | 内容 |
| --- | --- |
| `.github/ISSUE_TEMPLATE/bookmark.yml` | URL・一言コメント・タグを入力する Issue フォーム |
| `.github/workflows/bookmark-from-issue.yml` | ラベルなしで作られた Issue に `inbox` を付け、タイトルが URL なら本文へ移してページタイトルに置き換える。カテゴリ名のタグがあれば候補ラベルを付ける。カテゴリラベルが付いたとき、または候補ラベル付きで `inbox` を外したときに該当ファイルへ追記してクローズする |
| `.github/workflows/inbox-to-issues.yml` | `bookmarks/inbox.md` への push を検知し、各項目を `inbox` ラベル付き Issue に変換して inbox.md から取り除く |
| `.github/workflows/weekly-inbox-review.yml` | 毎週月曜 9:00 に未整理の件数と一覧をまとめた「週次inbox整理」Issue を作る |
| `scripts/bookmark-from-issue.mjs` | Issue 本文の解析と追記処理。タイトルが URL だけのときはページの `<title>` を取得して補う |
| `scripts/normalize-issue.mjs` | タイトルが URL の Issue を、URL は本文・タイトルはページタイトルという形に直す（タイトルのリンクはクリックできないため）。カテゴリ名のタグから候補ラベルを付ける |
| `scripts/inbox-to-issues.mjs` | `inbox.md` の項目を読み取り、Issue を作成する。作成に失敗した項目は inbox.md に残り、次の push で再試行される |
| `scripts/setup-labels.sh` | 運用で使うラベル（inbox・カテゴリ・weekly-review・article・experiment）を作成する |

Issue 本文は次のどの形式でも解析できます。

- Issue フォーム（`### 一言コメント` などのセクション形式）
- ショートカット形式（`コメント: ...` の行）
- 自由記述（Slack のメッセージなど）：URL とタグ以外の最初の行をコメントとして扱う

`#タグ` は本文中のどこに書いても拾います。

### タグでカテゴリの候補を付ける

`#frontend` / `#backend` / `#infra` / `#ai` のようにカテゴリ名のタグを書くと、Issue 作成時にそのカテゴリラベルが**候補**として付きます（`inbox` ラベルは残ります）。

- 候補が正しければ、`inbox` ラベルを外すと該当ファイルへ追記されて Issue がクローズされる
- 違っていれば、候補のラベルを外して正しいカテゴリラベルを付ける（付けた時点で追記される）
- 候補が複数付いた場合は、1つに絞ってから `inbox` を外す（複数のまま外すと、エラーをコメントして `inbox` を戻す）
- カテゴリ名のタグはファイル名と重複するため、ブックマークのタグには残さない
- 作成時にカテゴリラベルを直接指定した場合（`bm` コマンドの第3引数など）は、候補は付けずにそのまま追記する

## 設定手順

### 1. リポジトリとラベルの準備

```sh
# （必要なら）リポジトリ名を tech-lab に変更する
gh repo rename tech-lab

# ラベルを作成する
./scripts/setup-labels.sh
```

リポジトリの Settings → Actions → General → Workflow permissions で **Read and write permissions** を選びます。
ワークフロー側でも権限を明示していますが、リポジトリの設定で制限されていると push に失敗するためです。
main にブランチ保護を設定している場合、Actions からの push が拒否されます。その場合は `bookmarks/` への bot の push を許可してください。

> [!NOTE]
> 公開リポジトリだと、第三者も Issue を作成できます（カテゴリファイルへの追記はラベルを付けられる自分だけが実行できます）。
> ブックマークを公開したくない場合は Private リポジトリにしてください。

### 2. iPhone ショートカット

#### トークンを発行する

1. GitHub の Settings → Developer settings → **Fine-grained tokens** で新しいトークンを作る
2. Repository access：**Only select repositories** にして `tech-lab` を選ぶ
3. Permissions：Repository permissions の **Issues** を「Read and write」にする（それ以外は付けない）
4. 有効期限は1年程度にし、期限切れの通知が来たら再発行してショートカットのトークンを差し替える

#### ショートカットを作る

ショートカットアプリで新規作成し、次のアクションを順に並べます。

1. ショートカットの詳細（ⓘ）で **「共有シートに表示」** をオンにし、受け取る種類を「URL」「Safari Webページ」「テキスト」にする
2. **「URLを取得」**（入力：ショートカットの入力）
3. **「Webページの詳細を取得」**（詳細：名前、入力：ショートカットの入力）
   - X や YouTube アプリから共有すると名前を取得できない場合がある。空の場合は Actions がページタイトルを取得して補う
4. **「入力を要求」**（プロンプト：`コメント（#タグも可）`、空欄可）
5. **「テキスト」** に Issue 本文を組み立てる

   ```
   URL: [URL]
   コメント: [入力を要求の結果]
   ```

6. **「URLの内容を取得」** で次のように設定する
   - URL：`https://api.github.com/repos/<ユーザー名>/tech-lab/issues`
   - 方法：`POST`
   - ヘッダ
     - `Authorization`：`Bearer <発行したトークン>`
     - `Accept`：`application/vnd.github+json`
     - `X-GitHub-Api-Version`：`2022-11-28`
   - 要求本文：`JSON`
     - `title`（テキスト）：[Webページの詳細の名前]（空の場合は [URL]）
     - `body`（テキスト）：[テキスト]
     - `labels`（配列）：`inbox`
7. **「辞書の値を取得」**（キー：`html_url`）→ **「通知を表示」**（`追加しました`）
   - 失敗時はレスポンスに `message` が入るので、動作確認時は「クイックルック」で中身を確認する

使い方：Safari・X・YouTube などで共有ボタン → 作ったショートカットを選び、コメントを入力します。

> [!TIP]
> コメントに `#docker` のようにタグを書くと、そのままブックマークのタグになります。
> 既にカテゴリが分かっている場合は `labels` に `infra` などを加えると、inbox を経由せず即座にカテゴリファイルへ追記されます。

> [!WARNING]
> トークンはショートカット内に平文で保存されます。ショートカットを他人に共有する場合はトークンを消してから共有してください。
> 権限を Issues のみ・対象リポジトリのみに絞っているのはこのためです。

### 3. Slack の GitHub アプリ

1. Slack の App Directory から **GitHub** アプリをワークスペースに追加する
2. 任意のチャンネル（自分用の `#bookmarks` チャンネルやDMでよい）で `/github signin` を実行し、GitHub アカウントを連携する
3. URL を含むメッセージのメニュー（︙）→ **「その他のメッセージショートカット」** → GitHub の **「Create issue」** を選ぶ
4. リポジトリに `tech-lab` を選び、必要ならタイトルを編集して作成する

Slack から作った Issue にはラベルが付かないため、ワークフローが自動で `inbox` ラベルを付けます。
Slack モバイルアプリからも同じ操作で追加できます。

> [!NOTE]
> Slack アプリの画面やメニュー名は更新で変わることがあります。見つからない場合は `/github help` で現在のコマンドを確認してください。

### 4. 週1回の整理

毎週月曜に「週次inbox整理」Issue が作られ、GitHub の通知で届きます。

1. プロジェクトボードを開くか、Issue 一覧を `label:inbox is:open` で絞り込む
2. 残すものにカテゴリラベル（`frontend` / `backend` / `infra` / `ai`）を付ける → 数十秒で該当ファイルへ追記され、Issue がクローズされる
   - タグから候補ラベルが付いているもの（一覧に「候補」と表示）は、正しければ `inbox` ラベルを外すだけでよい
3. 不要なものは **Close as not planned** で閉じる
4. 「週次inbox整理」に `inbox.md` の残りが載っている場合は、Issue への変換に失敗しています
   - Actions の「Inbox to issues」のログを確認し、手動実行（Run workflow）で再試行する

GitHub モバイルアプリからもラベル付けできるので、移動中にも整理できます。

### 5. プロジェクトボード

プロジェクト [tech-lab](https://github.com/users/kawafuchieirin/projects/4) は作成済みで、リポジトリにリンクしています。
フィールドは Status（Todo / In Progress / Done）と種別（ブックマーク / 記事 / 検証）です。
次の2つは API で設定できないため、ブラウザで設定します。

1. ボード表示：プロジェクトの「+ New view」→ **Board** を追加し、Group by を Status にする
2. Issue の自動追加：右上の「…」→ **Workflows** → **Auto-add to project** を開く
   - フィルタを `is:issue label:inbox` にして有効にする
   - 同じ画面の **Item closed** が有効なら、クローズされた Issue は自動で Done になる

作り直す場合は、次のコマンドで同じ構成を再現できます（`project` 権限が必要：`gh auth refresh -s project`）。

```sh
gh project create --owner <ユーザー名> --title tech-lab
gh project link <番号> --owner <ユーザー名> --repo <ユーザー名>/tech-lab
gh project field-create <番号> --owner <ユーザー名> --name "種別" \
  --data-type SINGLE_SELECT --single-select-options "ブックマーク,記事,検証"
```
