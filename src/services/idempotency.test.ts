import { afterEach, describe, expect, it } from "vitest";
import { clearIdempotency, isRequestId, runOnce } from "./idempotency.js";

afterEach(() => clearIdempotency());

describe("isRequestId", () => {
  it("accepts uuid-style and hex ids", () => {
    expect(isRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isRequestId("abcdef1234567890")).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(isRequestId("short")).toBe(false);
    expect(isRequestId("has space")).toBe(false);
    expect(isRequestId("a".repeat(65))).toBe(false);
    expect(isRequestId(42)).toBe(false);
    expect(isRequestId(undefined)).toBe(false);
  });
});

describe("runOnce", () => {
  it("runs concurrent tasks once per key and shares the result", async () => {
    let calls = 0;
    const task = async (): Promise<string> => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "DCPT230-1";
    };

    const [first, second] = await Promise.all([runOnce("k1", task), runOnce("k1", task)]);
    expect(first).toBe("DCPT230-1");
    expect(second).toBe("DCPT230-1");
    expect(calls).toBe(1);
  });

  it("runs independently for different keys", async () => {
    let calls = 0;
    const task = async (): Promise<number> => {
      calls += 1;
      return calls;
    };

    expect(await runOnce("k2", task)).toBe(1);
    expect(await runOnce("k3", task)).toBe(2);
  });

  it("retries when the previous attempt failed", async () => {
    let calls = 0;
    const task = async (): Promise<string> => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return "ok";
    };

    await expect(runOnce("k4", task)).rejects.toThrow("boom");
    expect(await runOnce("k4", task)).toBe("ok");
    expect(calls).toBe(2);
  });
});
