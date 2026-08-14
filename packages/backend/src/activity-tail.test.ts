// PERF-02's proof. The pure describes below need no disk; the readActivityTick
// describe drives a real mkdtemp file end to end, which is what moves the
// truncation-reset and no-new-bytes rows of 04-VALIDATION.md out of the
// un-provable bucket.
//
// The `it` titles are a CONTRACT with 04-VALIDATION.md's PERF-02 rows, which
// address themselves as `-t "partial"`, `-t "utf-8"`, `-t "truncation"`,
// `-t "no new bytes"` and `-t "partial cap"`. vitest's -t is a substring match
// over the full test name, so "no new lines" would resolve to zero tests while
// still reading correctly to a human. Do not reword these.
import { Buffer } from "buffer";
import { appendFile, mkdtemp, rm, truncate, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVITY_MAX_TICK_BYTES,
  ACTIVITY_PARTIAL_MAX_BYTES,
  consumeActivityChunk,
  createActivityCursor,
  planActivityRead,
  readActivityTick,
} from "./activity-tail";

describe("createActivityCursor", () => {
  it("starts at byte zero with an empty Buffer remainder and no dropped bytes", () => {
    const cursor = createActivityCursor();

    expect(cursor.offset).toBe(0);
    expect(Buffer.isBuffer(cursor.partial)).toBe(true);
    expect(cursor.partial.byteLength).toBe(0);
    expect(cursor.droppedBytes).toBe(0);
  });

  it("exposes the two byte ceilings the threat register names", () => {
    expect(ACTIVITY_MAX_TICK_BYTES).toBe(1048576);
    expect(ACTIVITY_PARTIAL_MAX_BYTES).toBe(4194304);
  });
});

describe("consumeActivityChunk", () => {
  it("carries a partial line across chunks and emits it once the newline arrives", () => {
    const record = JSON.stringify({
      id: "act-1",
      type: "tool-call",
      toolName: "search_history",
    });
    const full = Buffer.from(`${record}\n`, "utf-8");
    const splitAt = 17;

    const first = consumeActivityChunk(
      createActivityCursor(),
      full.subarray(0, splitAt),
    );
    expect(first.lines).toEqual([]);
    expect(first.cursor.partial.byteLength).toBe(splitAt);

    const second = consumeActivityChunk(first.cursor, full.subarray(splitAt));
    expect(second.lines).toEqual([record]);
    expect(second.cursor.partial.byteLength).toBe(0);
  });

  it("keeps a multi-byte utf-8 sequence intact when the read boundary falls mid-codepoint", () => {
    // JSON.stringify does not escape non-ASCII, so all three of these reach the
    // activity file as raw UTF-8 bytes a read boundary can land inside.
    const record = JSON.stringify({
      id: "act-utf8",
      type: "tool-result",
      toolName: "search_history",
      resultSummary: "host bücher.example — 3 matches for 管理",
    });
    const full = Buffer.from(`${record}\n`, "utf-8");
    const emDash = Buffer.from("—", "utf-8");
    expect(emDash.byteLength).toBe(3);

    const emDashAt = full.indexOf(emDash);
    expect(emDashAt).toBeGreaterThan(0);
    const splitAt = emDashAt + 1; // inside the 3-byte sequence

    // Positive control: the naive string carry really is lossy at this index, so
    // the assertions below cannot pass vacuously on a boundary that was safe.
    expect(full.subarray(0, splitAt).toString("utf-8")).toContain("�");

    const first = consumeActivityChunk(
      createActivityCursor(),
      full.subarray(0, splitAt),
    );
    expect(first.lines).toEqual([]);

    const second = consumeActivityChunk(first.cursor, full.subarray(splitAt));
    expect(second.lines).toEqual([record]);
    expect(second.lines[0]).not.toContain("�");
    expect(second.lines[0]).toContain("bücher.example");
    expect(second.lines[0]).toContain("管理");
  });

  it("emits multiple complete lines and trims and drops empty ones", () => {
    const chunk = Buffer.from(
      '  {"id":"1"}  \n\n{"id":"2"}\n   \n{"id":"3"}\n',
      "utf-8",
    );

    const result = consumeActivityChunk(createActivityCursor(), chunk);

    expect(result.lines).toEqual(['{"id":"1"}', '{"id":"2"}', '{"id":"3"}']);
    expect(result.cursor.partial.byteLength).toBe(0);
    expect(result.cursor.droppedBytes).toBe(0);
  });

  it("returns no lines and buffers everything when the chunk contains no newline", () => {
    const chunk = Buffer.from('{"id":"1","type":"tool-call"', "utf-8");

    const result = consumeActivityChunk(createActivityCursor(), chunk);

    expect(result.lines).toEqual([]);
    expect(result.cursor.partial.byteLength).toBe(chunk.byteLength);
    expect(result.cursor.partial.toString("utf-8")).toBe(
      chunk.toString("utf-8"),
    );
    expect(result.cursor.droppedBytes).toBe(0);
  });

  it("leaves the offset untouched so the caller can advance it by bytesRead", () => {
    const cursor = { ...createActivityCursor(), offset: 4096 };

    const result = consumeActivityChunk(cursor, Buffer.from('{"id":"1"}\n'));

    expect(result.cursor.offset).toBe(4096);
  });

  it("drops and counts an unterminated partial that exceeds the partial cap", () => {
    const chunk = Buffer.alloc(128, 0x61); // 128 'a', no 0x0a anywhere

    const result = consumeActivityChunk(createActivityCursor(), chunk, {
      maxPartialBytes: 64,
    });

    expect(result.lines).toEqual([]);
    expect(result.cursor.partial.byteLength).toBe(0);
    expect(result.cursor.droppedBytes).toBe(128);
  });

  it("keeps an unterminated partial below the partial cap buffered rather than dropping it", () => {
    const chunk = Buffer.alloc(32, 0x61);

    const result = consumeActivityChunk(createActivityCursor(), chunk, {
      maxPartialBytes: 64,
    });

    expect(result.cursor.droppedBytes).toBe(0);
    expect(result.cursor.partial.byteLength).toBe(chunk.byteLength);
  });

  it("applies the partial cap to the remainder and not to a chunk that contains newlines", () => {
    const lines = ["x".repeat(40), "y".repeat(40), "z".repeat(40)];
    const chunk = Buffer.from(`${lines.join("\n")}\n`, "utf-8");
    expect(chunk.byteLength).toBeGreaterThan(64);

    const result = consumeActivityChunk(createActivityCursor(), chunk, {
      maxPartialBytes: 64,
    });

    expect(result.lines).toEqual(lines);
    expect(result.cursor.droppedBytes).toBe(0);
    expect(result.cursor.partial.byteLength).toBe(0);
  });
});

describe("planActivityRead", () => {
  it("plans a read of the exact remaining byte count", () => {
    const cursor = { ...createActivityCursor(), offset: 120 };

    expect(planActivityRead({ cursor, size: 500 })).toEqual({
      action: "read",
      position: 120,
      length: 380,
    });
  });

  it("clamps the planned length to maxBytes", () => {
    const cursor = createActivityCursor();

    expect(planActivityRead({ cursor, size: 10000, maxBytes: 256 })).toEqual({
      action: "read",
      position: 0,
      length: 256,
    });
    expect(
      planActivityRead({ cursor, size: ACTIVITY_MAX_TICK_BYTES * 4 }),
    ).toEqual({
      action: "read",
      position: 0,
      length: ACTIVITY_MAX_TICK_BYTES,
    });
  });

  it("returns idle when size equals the cursor offset", () => {
    const cursor = { ...createActivityCursor(), offset: 512 };

    expect(planActivityRead({ cursor, size: 512 })).toEqual({
      action: "idle",
      position: 512,
      length: 0,
    });
  });

  it("returns reset when size is below the cursor offset", () => {
    const cursor = { ...createActivityCursor(), offset: 900 };

    expect(planActivityRead({ cursor, size: 40 })).toEqual({
      action: "reset",
      position: 0,
      length: 40,
    });
    expect(planActivityRead({ cursor, size: 40, maxBytes: 16 })).toEqual({
      action: "reset",
      position: 0,
      length: 16,
    });
  });
});

describe("readActivityTick", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  const makeActivityFile = async (): Promise<string> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "drift-activity-"));
    tempDirs.push(dir);
    return path.join(dir, "mcp-activity-session.jsonl");
  };

  it("reads no new bytes and returns no lines when nothing has been written since the last tick", async () => {
    const filePath = await makeActivityFile();
    const one = JSON.stringify({ id: "a", type: "tool-call" });
    const two = JSON.stringify({ id: "b", type: "tool-result" });
    const payload = `${one}\n${two}\n`;
    await writeFile(filePath, payload);

    const first = await readActivityTick({
      filePath,
      cursor: createActivityCursor(),
    });
    expect(first.lines).toEqual([one, two]);
    expect(first.cursor.offset).toBe(Buffer.byteLength(payload));

    const second = await readActivityTick({ filePath, cursor: first.cursor });
    expect(second.lines).toEqual([]);
    expect(second.cursor.offset).toBe(first.cursor.offset);
  });

  it("resets the cursor after truncation and re-reads the file from byte zero", async () => {
    const filePath = await makeActivityFile();
    const records = ["1", "2", "3"].map((id) => JSON.stringify({ id }));
    await writeFile(filePath, `${records.join("\n")}\n`);

    const first = await readActivityTick({
      filePath,
      cursor: createActivityCursor(),
    });
    expect(first.lines).toEqual(records);
    expect(first.cursor.offset).toBeGreaterThan(0);

    await truncate(filePath, 0);
    const replacement = JSON.stringify({ id: "rotated" });
    await writeFile(filePath, `${replacement}\n`);
    expect(Buffer.byteLength(`${replacement}\n`)).toBeLessThan(
      first.cursor.offset,
    );

    const second = await readActivityTick({ filePath, cursor: first.cursor });
    expect(second.lines).toEqual([replacement]);
    expect(second.cursor.offset).toBe(Buffer.byteLength(`${replacement}\n`));
  });

  it("reads only the bytes appended since the previous tick", async () => {
    const filePath = await makeActivityFile();
    const one = JSON.stringify({ id: "a" });
    await writeFile(filePath, `${one}\n`);

    const first = await readActivityTick({
      filePath,
      cursor: createActivityCursor(),
    });
    expect(first.lines).toEqual([one]);

    const two = JSON.stringify({ id: "b", resultSummary: "200 OK" });
    await appendFile(filePath, `${two}\n`);

    const second = await readActivityTick({ filePath, cursor: first.cursor });
    expect(second.lines).toEqual([two]);
    expect(second.cursor.offset).toBe(Buffer.byteLength(`${one}\n${two}\n`));
  });

  it("carries a torn append across ticks and emits the record once its newline lands", async () => {
    const filePath = await makeActivityFile();
    const record = JSON.stringify({
      id: "torn",
      resultSummary: "half-written",
    });
    const head = record.slice(0, 12);
    await writeFile(filePath, head);

    const first = await readActivityTick({
      filePath,
      cursor: createActivityCursor(),
    });
    expect(first.lines).toEqual([]);
    expect(first.cursor.partial.toString("utf-8")).toBe(head);

    await appendFile(filePath, `${record.slice(12)}\n`);

    const second = await readActivityTick({ filePath, cursor: first.cursor });
    expect(second.lines).toEqual([record]);
    expect(second.cursor.partial.byteLength).toBe(0);
  });

  it("clamps one tick to maxBytes and finishes the file on the following ticks", async () => {
    const filePath = await makeActivityFile();
    const records = ["alpha", "bravo", "charlie"].map((id) =>
      JSON.stringify({ id }),
    );
    const payload = `${records.join("\n")}\n`;
    const total = Buffer.byteLength(payload);
    expect(total).toBeGreaterThan(40);
    await writeFile(filePath, payload);

    const first = await readActivityTick({
      filePath,
      cursor: createActivityCursor(),
      maxBytes: 20,
    });
    expect(first.cursor.offset).toBe(20);
    expect(first.lines.length).toBeLessThan(records.length);

    const second = await readActivityTick({
      filePath,
      cursor: first.cursor,
      maxBytes: 20,
    });
    const third = await readActivityTick({
      filePath,
      cursor: second.cursor,
      maxBytes: 20,
    });

    expect([...first.lines, ...second.lines, ...third.lines]).toEqual(records);
    expect(third.cursor.offset).toBe(total);
  });

  it("returns the incoming cursor and no lines when the file does not exist", async () => {
    const filePath = await makeActivityFile();
    const incoming = { ...createActivityCursor(), offset: 42, droppedBytes: 7 };

    const result = await readActivityTick({ filePath, cursor: incoming });

    expect(result.lines).toEqual([]);
    expect(result.cursor).toBe(incoming);
  });
});
