import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function multipart(filename: string, content: string, type = "application/octet-stream") {
  const boundary = `----fedprint${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("FedPrint API", () => {
  it("reports health", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "fedprint" });
  });

  it("rejects unsupported file types with 415", async () => {
    const { body, headers } = multipart("malware.exe", "MZbinary");
    const response = await app.inject({ method: "POST", url: "/api/print", payload: body, headers });
    expect(response.statusCode).toBe(415);
    expect(response.json().code).toBe("UNSUPPORTED_FILE");
  });

  it("rejects requests without a file with 400", async () => {
    const boundary = `----fedprint${Math.random().toString(16).slice(2)}`;
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="copies"\r\n\r\n2\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/print",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("BAD_REQUEST");
  });

  it("rejects malformed multipart bodies gracefully", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/print",
      payload: "not multipart",
      headers: { "content-type": "text/plain" },
    });
    expect([400, 415]).toContain(response.statusCode);
    expect(response.json().ok).toBe(false);
  });

  it("returns 400 for an invalid cancel job id", async () => {
    const response = await app.inject({ method: "POST", url: "/api/jobs/bad%20id!/cancel" });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("BAD_REQUEST");
  });
});
