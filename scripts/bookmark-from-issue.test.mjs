import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  extractHtmlTitle,
  fetchPageTitle,
  formatBookmark,
  parseIssue,
  run,
  toJstDate,
} from "./bookmark-from-issue.mjs";

describe("parseIssue", () => {
  it("iPhone ショートカット形式の本文を解析する", () => {
    const result = parseIssue({
      title: "Docker Compose Tips",
      body: "URL: https://example.com/compose\nコメント: watch が便利 #docker\nタグ: #compose",
    });
    assert.deepEqual(result, {
      url: "https://example.com/compose",
      title: "Docker Compose Tips",
      comment: "watch が便利",
      tags: ["docker", "compose"],
      savedDate: null,
    });
  });

  it("Issue フォーム形式の本文を解析する", () => {
    const body = [
      "### URL",
      "",
      "https://example.com/a",
      "",
      "### 一言コメント",
      "",
      "あとで読む",
      "",
      "### タグ",
      "",
      "#react #nextjs",
    ].join("\n");
    const result = parseIssue({ title: "React の記事", body });
    assert.equal(result.url, "https://example.com/a");
    assert.equal(result.comment, "あとで読む");
    assert.deepEqual(result.tags, ["react", "nextjs"]);
  });

  it("Issue フォームでコメント未入力なら空文字にする", () => {
    const body = "### URL\n\nhttps://example.com/a\n\n### 一言コメント\n\n_No response_\n\n### タグ\n\n_No response_";
    assert.equal(parseIssue({ title: "t", body }).comment, "");
  });

  it("Slack の <URL|表示名> 形式から URL だけを取り出す", () => {
    const result = parseIssue({
      title: "Slack message",
      body: "これ良さそう <https://example.com/slack|example.com> #ai",
    });
    assert.equal(result.url, "https://example.com/slack");
    assert.equal(result.comment, "これ良さそう");
    assert.deepEqual(result.tags, ["ai"]);
  });

  it("タイトルが URL のみならタイトルは null（後で取得する）", () => {
    const result = parseIssue({ title: "https://example.com/x", body: "" });
    assert.equal(result.url, "https://example.com/x");
    assert.equal(result.title, null);
  });

  it("Markdown 見出しや URL のフラグメントをタグとして扱わない", () => {
    const result = parseIssue({ title: "t", body: "# 見出し\nhttps://example.com/p#section" });
    assert.deepEqual(result.tags, []);
    assert.equal(result.url, "https://example.com/p#section");
  });

  it("保存日の行があれば取り出し、コメントとして扱わない", () => {
    const result = parseIssue({ title: "t", body: "URL: https://e.com\n保存日: 2026-09-01" });
    assert.equal(result.savedDate, "2026-09-01");
    assert.equal(result.comment, "");
  });

  it("URL が無ければ null を返す", () => {
    assert.equal(parseIssue({ title: "メモ", body: "URL なし" }), null);
    assert.equal(parseIssue({ title: "メモ", body: null }), null);
  });
});

describe("formatBookmark", () => {
  it("規定の2行形式で出力する", () => {
    const text = formatBookmark({
      title: "記事",
      url: "https://example.com",
      date: "2026-09-23",
      comment: "良い",
      tags: ["docker"],
    });
    assert.equal(text, "- [記事](https://example.com) - 2026-09-23\n  - 良い #docker\n");
  });

  it("コメントとタグが無いときは（コメントなし）と書く", () => {
    const text = formatBookmark({ title: "t", url: "https://e.com", date: "2026-09-23", comment: "", tags: [] });
    assert.equal(text, "- [t](https://e.com) - 2026-09-23\n  - （コメントなし）\n");
  });

  it("タイトル中の改行と角括弧でリンク表記を壊さない", () => {
    const text = formatBookmark({
      title: "[PR] foo\nbar",
      url: "https://e.com",
      date: "2026-09-23",
      comment: "a\nb",
      tags: [],
    });
    assert.equal(text, "- [［PR］ foo bar](https://e.com) - 2026-09-23\n  - a b\n");
  });
});

describe("toJstDate", () => {
  it("UTC の日付境界を日本時間に変換する", () => {
    assert.equal(toJstDate("2026-09-22T15:30:00Z"), "2026-09-23");
    assert.equal(toJstDate("2026-09-22T14:59:59Z"), "2026-09-22");
  });
});

describe("extractHtmlTitle", () => {
  it("title 要素を取り出して実体参照を戻す", () => {
    assert.equal(extractHtmlTitle("<html><title>\n A &amp; B &#39;x&#39; </title></html>"), "A & B 'x'");
  });

  it("title が無ければ null", () => {
    assert.equal(extractHtmlTitle("<html></html>"), null);
    assert.equal(extractHtmlTitle("<title> </title>"), null);
  });
});

describe("fetchPageTitle", () => {
  it("通信エラー時は null を返して処理を止めない", async () => {
    const failing = async () => {
      throw new Error("network down");
    };
    assert.equal(await fetchPageTitle("https://e.com", { fetchImpl: failing }), null);
  });

  it("HTTP エラー時は null を返す", async () => {
    const notFound = async () => ({ ok: false, text: async () => "" });
    assert.equal(await fetchPageTitle("https://e.com", { fetchImpl: notFound }), null);
  });
});

describe("run", () => {
  async function setup(initial = "# Infra\n") {
    const dir = await mkdtemp(join(tmpdir(), "bookmarks-"));
    await writeFile(join(dir, "infra.md"), initial);
    return dir;
  }
  const event = (title, body) => ({ issue: { title, body, created_at: "2026-09-23T01:00:00Z" } });
  const noFetch = async () => null;

  it("カテゴリファイルの末尾に追記する", async () => {
    const dir = await setup();
    const result = await run({
      event: event("Terraform 入門", "https://example.com/tf\nコメント: 基礎 #terraform"),
      labelName: "infra",
      bookmarksDir: dir,
      fetchTitle: noFetch,
    });
    assert.equal(result.status, "added");
    assert.equal(
      await readFile(join(dir, "infra.md"), "utf8"),
      "# Infra\n- [Terraform 入門](https://example.com/tf) - 2026-09-23\n  - 基礎 #terraform\n",
    );
  });

  it("末尾に改行が無いファイルでも行が連結されない", async () => {
    const dir = await setup("# Infra");
    await run({ event: event("t", "https://e.com"), labelName: "infra", bookmarksDir: dir, fetchTitle: noFetch });
    assert.match(await readFile(join(dir, "infra.md"), "utf8"), /^# Infra\n- \[t\]/);
  });

  it("タイトルが URL のみならページタイトルを取得して使う", async () => {
    const dir = await setup();
    await run({
      event: event("https://e.com/x", ""),
      labelName: "infra",
      bookmarksDir: dir,
      fetchTitle: async () => "取得したタイトル",
    });
    assert.match(await readFile(join(dir, "infra.md"), "utf8"), /\[取得したタイトル\]\(https:\/\/e\.com\/x\)/);
  });

  it("本文に保存日があれば Issue の作成日より優先する", async () => {
    const dir = await setup();
    await run({
      event: event("t", "URL: https://e.com\n保存日: 2026-09-01"),
      labelName: "infra",
      bookmarksDir: dir,
      fetchTitle: noFetch,
    });
    assert.match(await readFile(join(dir, "infra.md"), "utf8"), / - 2026-09-01\n/);
  });

  it("同じ URL が登録済みなら追記しない", async () => {
    const dir = await setup("# Infra\n- [t](https://e.com) - 2026-09-01\n  - x\n");
    const result = await run({ event: event("t", "https://e.com"), labelName: "infra", bookmarksDir: dir });
    assert.equal(result.status, "duplicate");
  });

  it("カテゴリ以外のラベルは無視する", async () => {
    const result = await run({ event: event("t", "https://e.com"), labelName: "inbox" });
    assert.equal(result.status, "skipped");
  });

  it("URL が無い Issue はエラーを返す", async () => {
    const dir = await setup();
    const result = await run({ event: event("メモ", "本文"), labelName: "infra", bookmarksDir: dir });
    assert.equal(result.status, "error");
  });
});
