// Issue にカテゴリラベルが付いたとき、bookmarks/<category>.md へ1件追記する。
// GitHub Actions（.github/workflows/bookmark-from-issue.yml）から呼ばれる。
// Issue の本文は外部入力なので、シェルには渡さずこのスクリプト内で解析・整形する。
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const CATEGORIES = ["frontend", "backend", "infra", "ai"];

// Slack 経由の本文は <https://...|表示名> 形式になるため、<>| で URL を打ち切る
const URL_PATTERN = /https?:\/\/[^\s<>|)\]"']+/;
// 見出し（"# 見出し"）や URL のフラグメントを拾わないよう、空白直後の #xxx だけをタグとみなす
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;
const COMMENT_LABEL = /^(?:コメント|comment)\s*[:：]\s*/i;
const META_LINE = /^(?:url|タグ|tags?)\s*[:：]/i;
const FORM_SECTION = /^###\s+(.+)$/;
const NO_RESPONSE = "_No response_";
const SLACK_LINK = /<https?:\/\/[^>]*>/g;

export function parseIssue({ title = "", body = "" }) {
  const text = `${title}\n${body ?? ""}`;
  const url = text.match(URL_PATTERN)?.[0];
  if (!url) return null;

  const tags = [...new Set([...text.matchAll(TAG_PATTERN)].map((m) => m[1]))];
  const titleIsUrlOnly = title.trim() === "" || URL_PATTERN.test(title);

  return {
    url,
    title: titleIsUrlOnly ? null : title.trim(),
    comment: extractComment(body ?? ""),
    tags,
  };
}

// 対応する本文の形式:
//   1. Issue フォーム（"### 一言コメント" セクション）
//   2. iPhone ショートカット（"コメント: ..." 行）
//   3. 自由記述（Slack など）：URL・タグ以外の最初の行
function extractComment(body) {
  const lines = body.split(/\r?\n/).map((l) => l.trim());

  const sectionIndex = lines.findIndex((l) => FORM_SECTION.test(l) && l.includes("コメント"));
  if (sectionIndex !== -1) {
    const next = lines.slice(sectionIndex + 1).find((l) => l !== "");
    return next && !FORM_SECTION.test(next) && next !== NO_RESPONSE ? stripTags(next) : "";
  }

  const labeled = lines.find((l) => COMMENT_LABEL.test(l));
  if (labeled) return stripTags(labeled.replace(COMMENT_LABEL, ""));

  const free = lines.find(
    (l) => l !== "" && !FORM_SECTION.test(l) && !META_LINE.test(l) && stripUrls(l) !== "",
  );
  return free ? stripUrls(free) : "";
}

function stripUrls(line) {
  return stripTags(line.replace(SLACK_LINK, "").replace(new RegExp(URL_PATTERN, "g"), ""));
}

function stripTags(line) {
  return line.replace(TAG_PATTERN, "").replace(/[<>|]/g, "").trim();
}

// Markdown のリンク表記と1項目2行の形式を崩さないよう、改行と角括弧をならす
function sanitizeInline(value) {
  return value.replace(/\s+/g, " ").replace(/\[/g, "［").replace(/\]/g, "］").trim();
}

export function formatBookmark({ title, url, date, comment, tags }) {
  const tagText = tags.map((t) => `#${t}`).join(" ");
  const note = [sanitizeInline(comment || "（コメントなし）"), tagText].filter(Boolean).join(" ");
  return `- [${sanitizeInline(title || url)}](${url}) - ${date}\n  - ${note}\n`;
}

// 保存日は日本時間で記録する（Actions の実行環境は UTC のため明示的に変換）
export function toJstDate(isoString) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(isoString));
}

export function extractHtmlTitle(html) {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;
  const decoded = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
  return decoded || null;
}

// タイトル取得は補助的な処理なので、失敗しても URL をタイトルとして使い処理を続ける
export async function fetchPageTitle(url, { timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (tech-lab bookmark bot)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return extractHtmlTitle(await res.text());
  } catch (error) {
    console.warn(`タイトル取得に失敗したため URL を使います: ${error.message}`);
    return null;
  }
}

export async function run({ event, labelName, bookmarksDir = "bookmarks", fetchTitle = fetchPageTitle }) {
  if (!CATEGORIES.includes(labelName)) {
    return { status: "skipped", reason: `カテゴリラベルではありません: ${labelName}` };
  }
  const issue = event.issue;
  const parsed = parseIssue({ title: issue.title, body: issue.body });
  if (!parsed) {
    return { status: "error", reason: "Issue のタイトル・本文に URL が見つかりませんでした。" };
  }

  const file = `${bookmarksDir}/${labelName}.md`;
  const current = await readFile(file, "utf8");
  if (current.includes(`](${parsed.url})`)) {
    return { status: "duplicate", file, url: parsed.url };
  }

  const title = parsed.title ?? (await fetchTitle(parsed.url)) ?? parsed.url;
  const entry = formatBookmark({ ...parsed, title, date: toJstDate(issue.created_at) });
  await appendFile(file, current.endsWith("\n") ? entry : `\n${entry}`);
  return { status: "added", file, url: parsed.url, entry };
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const result = await run({ event, labelName: event.label?.name ?? "" });
  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    const outputs = { status: result.status, file: result.file ?? "", reason: result.reason ?? "" };
    const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v).replace(/\n/g, " ")}`);
    await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
