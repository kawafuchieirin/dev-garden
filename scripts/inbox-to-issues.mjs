// bookmarks/inbox.md に書かれた項目を inbox ラベル付きの Issue に変換し、inbox.md から取り除く。
// GitHub Actions（.github/workflows/inbox-to-issues.yml）から呼ばれる。
// 変換後の Issue は bookmark-from-issue.mjs の parseIssue で読める本文形式にする。
import { execFile } from "node:child_process";
import { readFile, appendFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { fetchPageTitle, titleFromUrl } from "./bookmark-from-issue.mjs";

export const INBOX_PATH = "bookmarks/inbox.md";

// - [タイトル](URL) - 保存日（保存日は省略可）
const BOOKMARK_LINE = /^[-*]\s+\[(.+?)\]\((https?:\/\/[^)\s]+)\)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
// URL だけの行（箇条書きの記号は省略可）。PC から手早く貼る用
const URL_LINE = /^(?:[-*]\s+)?(https?:\/\/\S+)\s*$/;
// 直前の項目に属するインデントされた1行（一言コメントとタグ）
const DETAIL_LINE = /^\s+[-*]\s+(.+)$/;

export function parseInbox(content) {
  const lines = content.split("\n");
  const entries = [];
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    // 記入例などを HTML コメントに書いても Issue にしないよう、コメント内は読み飛ばす
    if (inComment || lines[i].trimStart().startsWith("<!--")) {
      inComment = !lines[i].includes("-->");
      continue;
    }
    const bookmark = lines[i].match(BOOKMARK_LINE);
    const bare = bookmark ? null : lines[i].match(URL_LINE);
    if (!bookmark && !bare) continue;

    const detail = lines[i + 1]?.match(DETAIL_LINE);
    entries.push({
      title: bookmark ? bookmark[1].trim() : null,
      url: bookmark ? bookmark[2] : bare[1],
      date: bookmark?.[3] ?? null,
      note: detail ? detail[1].trim() : "",
      lineIndexes: detail ? [i, i + 1] : [i],
    });
    if (detail) i++;
  }
  return { lines, entries };
}

export function removeEntries(lines, entries) {
  const removed = new Set(entries.flatMap((e) => e.lineIndexes));
  return lines.filter((_, i) => !removed.has(i)).join("\n");
}

// Issue タイトルのリンクはクリックできないため、URL は本文に置き、タイトルにはページタイトルを使う。
// Actions が作る Issue は normalize-issue.mjs を起動しないので、ここでタイトルを取得する
export async function buildIssue(entry, { fetchTitle = fetchPageTitle } = {}) {
  const body = [
    `URL: ${entry.url}`,
    `コメント: ${entry.note}`,
    ...(entry.date ? [`保存日: ${entry.date}`] : []),
    "",
    `<!-- ${INBOX_PATH} から自動作成 -->`,
  ].join("\n");
  // 取得できなかった場合の仮タイトルは、カテゴリ振り分け時にページタイトルを取得し直す
  return { title: entry.title ?? (await fetchTitle(entry.url)) ?? titleFromUrl(entry.url), body };
}

const execFileAsync = promisify(execFile);

// シェルを介さず引数配列で gh を呼ぶ（タイトルや本文は外部入力のため）
export async function createIssueWithGh({ title, body }, { attempts = 2, timeoutMs = 30_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const child = execFileAsync("gh", ["issue", "create", "--title", title, "--body-file", "-", "--label", "inbox"], {
        timeout: timeoutMs,
      });
      child.child.stdin.end(body);
      const { stdout } = await child;
      return stdout.trim();
    } catch (error) {
      lastError = error;
      console.warn(`Issue 作成に失敗しました（${attempt}/${attempts}回目）: ${error.message}`);
    }
  }
  throw lastError;
}

// 作成に成功した項目だけを inbox.md から取り除く。失敗した項目は次回の push で再試行される
export async function run({ content, createIssue = createIssueWithGh, fetchTitle = fetchPageTitle }) {
  const { lines, entries } = parseInbox(content);
  const created = [];
  const failed = [];

  for (const entry of entries) {
    try {
      const url = await createIssue(await buildIssue(entry, { fetchTitle }));
      created.push({ ...entry, issueUrl: url });
    } catch (error) {
      failed.push({ ...entry, error: error.message });
    }
  }
  return { content: removeEntries(lines, created), created, failed };
}

async function main() {
  const result = await run({ content: await readFile(INBOX_PATH, "utf8") });
  await writeFile(INBOX_PATH, result.content);

  for (const c of result.created) console.log(`作成: ${c.url} → ${c.issueUrl}`);
  for (const f of result.failed) console.error(`失敗: ${f.url}（${f.error}）`);
  console.log(`作成 ${result.created.length} 件 / 失敗 ${result.failed.length} 件`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `created=${result.created.length}\nfailed=${result.failed.length}\n`);
  }
  if (result.failed.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
