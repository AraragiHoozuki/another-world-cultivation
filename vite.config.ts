import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

type RuntimeEnv = { VITE_BASE?: string };

function runtimeEnv(): RuntimeEnv {
  return (globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }).process?.env ?? {};
}

type ProxyRequest = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, handler: (...args: any[]) => void) => void;
};
type ProxyResponse = {
  statusCode: number;
  setHeader: (name: string, value: string | number) => void;
  write: (chunk: Uint8Array) => void;
  end: (body?: string | Uint8Array) => void;
};

function readProxyBody(request: ProxyRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk: Uint8Array | string) => chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
    request.on("end", () => {
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const body = new Uint8Array(length);
      let offset = 0;
      chunks.forEach((chunk) => { body.set(chunk, offset); offset += chunk.byteLength; });
      resolve(body);
    });
    request.on("error", reject);
  });
}

async function handleAiProxy(request: ProxyRequest, response: ProxyResponse, next: () => void): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const targetValue = requestUrl.searchParams.get("url");
  if (!targetValue) { next(); return; }
  let target: URL;
  try { target = new URL(targetValue); } catch { response.statusCode = 400; response.end(JSON.stringify({ error: "Invalid AI target URL" })); return; }
  if (target.protocol !== "http:" && target.protocol !== "https:") { response.statusCode = 400; response.end(JSON.stringify({ error: "Only HTTP(S) AI targets are supported" })); return; }
  if (request.method === "OPTIONS") { response.statusCode = 204; response.setHeader("access-control-allow-origin", "*"); response.end(); return; }
  try {
    const headers = new Headers();
    Object.entries(request.headers).forEach(([name, value]) => {
      if (["host", "connection", "content-length", "accept-encoding"].includes(name)) return;
      if (typeof value === "string") headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(", "));
    });
    // Some AI gateways negotiate zstd when the browser advertises it. Node's
    // fetch does not consistently decode zstd, so request an identity body
    // before streaming the response to the browser.
    headers.set("accept-encoding", "identity");
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readProxyBody(request);
    const upstream = await fetch(target, { method: request.method ?? "GET", headers, body: body as unknown as BodyInit });
    response.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      // Node fetch transparently decompresses upstream bodies. Forwarding the
      // original encoding header would make the browser try to decompress it a
      // second time and fail with ERR_CONTENT_DECODING_FAILED.
      if (!["content-length", "content-encoding", "connection", "transfer-encoding"].includes(name)) response.setHeader(name, value);
    });
    response.setHeader("access-control-allow-origin", "*");
    if (upstream.body) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          response.write(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    response.end();
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "AI proxy request failed" }));
  }
}

function aiProxyPlugin(): Plugin {
  const attach = (server: any) => {
    server.middlewares.use("/api/ai-proxy", (request: ProxyRequest, response: ProxyResponse, next: () => void) => { void handleAiProxy(request, response, next); });
  };
  return {
    name: "another-world-ai-proxy",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => ({
  base: runtimeEnv().VITE_BASE || loadEnv(mode, ".", "VITE_").VITE_BASE || "/",
  plugins: [react(), aiProxyPlugin()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/testSetup.ts",
    css: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
