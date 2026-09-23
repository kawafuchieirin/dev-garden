import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIssue } from "./bookmark-from-issue.mjs";
import { buildIssue, parseInbox, run } from "./inbox-to-issues.mjs";

const HEADER = "# Inbox\n\n説明文 [docs](../docs/url-collection.md)\n\n<!-- この下に追記する -->\n";

describe("parseInbox", () => {
  it("ブックマーク形式とコメント行を1項目として読む", () => {
    const { entries } = parseInbox(`${HEADER}- [記事](https://e.com/a) - 2026-09-20\n  - 良い #docker\n`);
    assert.equal(entries.length, 1);
    assert.deepEqual(
      { ...entries[0], lineIndexes: undefined },
      { title: "記事", url: "https://e.com/a", date: "2026-09-20", note: "良い #docker", lineIndexes: undefined },
    );
  });

  it("保存日やコメントが無い形式、URL だけの行も読む", () => {
    const { entries } = parseInbox("- [記事](https://e.com/a)\n- https://e.com/b\nhttps://e.com/c\n  - メモ\n");
    assert.deepEqual(
      entries.map((e) => [e.title, e.url, e.date, e.note]),
      [
        ["記事", "https://e.com/a", null, ""],
        [null, "https://e.com/b", null, ""],
        [null, "https://e.com/c", null, "メモ"],
      ],
    );
  });

  it("見出し・説明文・コメント行の中のリンクは項目として扱わない", () => {
    assert.equal(parseInbox(HEADER).entries.length, 0);
  });

  it("HTML コメント内の記入例は項目として扱わない", () => {
    const { entries } = parseInbox("<!--\n- [例](https://example.com)\n- https://example.com\n-->\n<!-- 1行 -->\n- https://e.com/real\n");
    assert.deepEqual(
      entries.map((e) => e.url),
      ["https://e.com/real"],
    );
  });

  it("角括弧を含むタイトルも読める", () => {
    const { entries } = parseInbox("- [[PR] 新機能](https://e.com/pr) - 2026-09-20\n");
    assert.equal(entries[0].title, "[PR] 新機能");
  });
});

describe("buildIssue", () => {
  it("bookmark-from-issue の parseIssue で元の情報を復元できる", async () => {
    const [entry] = parseInbox("- [記事](https://e.com/a) - 2026-09-20\n  - 良い #docker #compose\n").entries;
    const issue = await buildIssue(entry, { fetchTitle: async () => assert.fail("呼ばれてはいけない") });
    assert.deepEqual(parseIssue(issue), {
      url: "https://e.com/a",
      title: "記事",
      comment: "良い",
      tags: ["docker", "compose"],
      savedDate: "2026-09-20",
    });
  });

  it("タイトルが無ければページタイトルを取得し、URL は本文に置く", async () => {
    const [entry] = parseInbox("- https://e.com/b\n").entries;
    const issue = await buildIssue(entry, { fetchTitle: async () => "取得したタイトル" });
    assert.equal(issue.title, "取得したタイトル");
    assert.match(issue.body, /^URL: https:\/\/e\.com\/b$/m);
    assert.equal(parseIssue(issue).title, "取得したタイトル");
    assert.equal(parseIssue(issue).comment, "");
  });

  it("ページタイトルを取得できなければ仮タイトルにし、振り分け時に再取得させる", async () => {
    const [entry] = parseInbox("- https://e.com/b\n").entries;
    const issue = await buildIssue(entry, { fetchTitle: async () => null });
    assert.equal(issue.title, "e.com/b");
    assert.equal(parseIssue(issue).title, null);
    assert.equal(parseIssue(issue).url, "https://e.com/b");
  });
});

describe("run", () => {
  it("Issue にした項目を取り除き、それ以外の行は残す", async () => {
    const content = `${HEADER}- [記事](https://e.com/a) - 2026-09-20\n  - 良い\n- https://e.com/b\n`;
    const calls = [];
    const result = await run({
      content,
      fetchTitle: async () => null,
      createIssue: async (issue) => {
        calls.push(issue.title);
        return `https://github.com/o/r/issues/${calls.length}`;
      },
    });
    assert.deepEqual(calls, ["記事", "e.com/b"]);
    assert.equal(result.content, HEADER);
    assert.equal(result.created.length, 2);
    assert.equal(result.failed.length, 0);
  });

  it("作成に失敗した項目は inbox.md に残す", async () => {
    const content = `${HEADER}- https://e.com/ok\n- https://e.com/ng\n  - 残る\n`;
    const result = await run({
      content,
      fetchTitle: async () => null,
      createIssue: async ({ title }) => {
        if (title.endsWith("/ng")) throw new Error("API error");
        return "https://github.com/o/r/issues/1";
      },
    });
    assert.equal(result.content, `${HEADER}- https://e.com/ng\n  - 残る\n`);
    assert.deepEqual(
      result.failed.map((f) => [f.url, f.error]),
      [["https://e.com/ng", "API error"]],
    );
  });

  it("項目が無ければ内容を変えない", async () => {
    const result = await run({
      content: HEADER,
      createIssue: async () => assert.fail("呼ばれてはいけない"),
    });
    assert.equal(result.content, HEADER);
    assert.equal(result.created.length, 0);
  });
});
