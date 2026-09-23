// 作られた Issue を整える。
// - タイトルが URL なら、URL は本文・タイトルはページタイトルという形に直す（タイトルのリンクはクリックできないため）
// - #infra のようにカテゴリ名のタグがあれば、そのカテゴリラベルを候補として付ける
//   Actions が付けたラベルはワークフローを起動しないので、追記は inbox ラベルを外したとき（確認後）に行われる
// GitHub Actions（.github/workflows/bookmark-from-issue.yml）から、Issue が作られたときに呼ばれる。
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  CATEGORIES,
  URL_PATTERN,
  categoriesFromTags,
  fetchPageTitle,
  parseIssue,
  titleFromUrl,
} from "./bookmark-from-issue.mjs";

// 直す必要が無ければ null を返す
export async function normalizeIssue({ title = "", body = "" }, { fetchTitle = fetchPageTitle } = {}) {
  const url = title.match(URL_PATTERN)?.[0];
  if (!url) return null;

  const text = body ?? "";
  return {
    title: (await fetchTitle(url)) ?? titleFromUrl(url),
    body: text.includes(url) ? text : `URL: ${url}\n${text}`,
  };
}

// 作成時にカテゴリラベルが指定されていれば（bm コマンドなど）、そちらを優先して候補は付けない
export function candidateLabels({ title = "", body = "", labels = [] }) {
  if (labels.some((l) => CATEGORIES.includes(l.name))) return [];
  return categoriesFromTags(parseIssue({ title, body })?.tags ?? []);
}

const execFileAsync = promisify(execFile);

// タイトルや本文は外部入力のため、シェルを介さず引数配列で gh を呼ぶ
async function editIssueWithGh(number, { title, body, addLabels }, { timeoutMs = 30_000 } = {}) {
  const args = ["issue", "edit", String(number), "--repo", process.env.GITHUB_REPOSITORY];
  if (title !== undefined) args.push("--title", title, "--body-file", "-");
  if (addLabels.length > 0) args.push("--add-label", addLabels.join(","));
  const child = execFileAsync("gh", args, { timeout: timeoutMs });
  child.child.stdin.end(body ?? "");
  await child;
}

async function main() {
  const { issue } = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const normalized = await normalizeIssue({ title: issue.title, body: issue.body });
  const addLabels = candidateLabels(issue);
  if (!normalized && addLabels.length === 0) {
    console.log("変更はありません。");
    return;
  }
  await editIssueWithGh(issue.number, { ...normalized, addLabels });
  if (normalized) console.log(`タイトルを変更しました: ${normalized.title}`);
  if (addLabels.length > 0) console.log(`候補ラベルを付けました: ${addLabels.join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
