import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIssue } from "./bookmark-from-issue.mjs";
import { normalizeIssue } from "./normalize-issue.mjs";

const URL = "https://e.com/articles/a/";

describe("normalizeIssue", () => {
  it("タイトルの URL を本文へ移し、タイトルをページタイトルにする", async () => {
    const result = await normalizeIssue({ title: URL, body: "コメント: 良い #docker" }, { fetchTitle: async () => "記事" });
    assert.deepEqual(result, { title: "記事", body: `URL: ${URL}\nコメント: 良い #docker` });
    assert.deepEqual(parseIssue(result), {
      url: URL,
      title: "記事",
      comment: "良い",
      tags: ["docker"],
      savedDate: null,
    });
  });

  it("本文に URL が既にあれば本文は変えない", async () => {
    const body = `URL: ${URL}\nコメント: `;
    const result = await normalizeIssue({ title: URL, body }, { fetchTitle: async () => "記事" });
    assert.equal(result.body, body);
  });

  it("本文が空でも URL を本文に入れる", async () => {
    const result = await normalizeIssue({ title: URL, body: null }, { fetchTitle: async () => "記事" });
    assert.equal(result.body, `URL: ${URL}\n`);
  });

  it("ページタイトルを取得できなければスキームを外した URL をタイトルにし、振り分け時に再取得させる", async () => {
    const result = await normalizeIssue({ title: URL, body: "" }, { fetchTitle: async () => null });
    assert.equal(result.title, "e.com/articles/a");
    assert.equal(parseIssue(result).title, null);
    assert.equal(parseIssue(result).url, URL);
  });

  it("タイトルに URL が無ければ何もしない", async () => {
    const result = await normalizeIssue(
      { title: "記事", body: `URL: ${URL}` },
      { fetchTitle: async () => assert.fail("呼ばれてはいけない") },
    );
    assert.equal(result, null);
  });
});
