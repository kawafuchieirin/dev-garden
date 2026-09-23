// タイトルが URL の Issue を、URL は本文・タイトルはページタイトルという形に直す。
// Issue タイトルのリンクはクリックできないため、確認しやすいよう URL を本文に置く。
// GitHub Actions（.github/workflows/bookmark-from-issue.yml）から、Issue が作られたときに呼ばれる。
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { URL_PATTERN, fetchPageTitle, titleFromUrl } from "./bookmark-from-issue.mjs";

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

const execFileAsync = promisify(execFile);

// タイトルや本文は外部入力のため、シェルを介さず引数配列で gh を呼ぶ
async function editIssueWithGh(number, { title, body }, { timeoutMs = 30_000 } = {}) {
  const child = execFileAsync(
    "gh",
    ["issue", "edit", String(number), "--repo", process.env.GITHUB_REPOSITORY, "--title", title, "--body-file", "-"],
    { timeout: timeoutMs },
  );
  child.child.stdin.end(body);
  await child;
}

async function main() {
  const { issue } = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const normalized = await normalizeIssue({ title: issue.title, body: issue.body });
  if (!normalized) {
    console.log("タイトルに URL が無いため変更しません。");
    return;
  }
  await editIssueWithGh(issue.number, normalized);
  console.log(`タイトルを変更しました: ${normalized.title}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
