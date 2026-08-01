import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
function readProxyBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
        request.on("end", () => {
            const body = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
            let offset = 0;
            chunks.forEach((chunk) => { body.set(chunk, offset); offset += chunk.byteLength; });
            resolve(body);
        });
        request.on("error", reject);
    });
}
async function handleAiProxy(request, response, next) {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const targetValue = requestUrl.searchParams.get("url");
    if (!targetValue) { next(); return; }
    let target;
    try { target = new URL(targetValue); }
    catch { response.statusCode = 400; response.end(JSON.stringify({ error: "Invalid AI target URL" })); return; }
    if (target.protocol !== "http:" && target.protocol !== "https:") { response.statusCode = 400; response.end(JSON.stringify({ error: "Only HTTP(S) AI targets are supported" })); return; }
    if (request.method === "OPTIONS") { response.statusCode = 204; response.setHeader("access-control-allow-origin", "*"); response.end(); return; }
    try {
        const headers = new Headers();
        Object.entries(request.headers).forEach(([name, value]) => {
            if (["host", "connection", "content-length"].includes(name)) return;
            if (typeof value === "string") headers.set(name, value);
            else if (Array.isArray(value)) headers.set(name, value.join(", "));
        });
        const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readProxyBody(request);
        const upstream = await fetch(target, { method: request.method ?? "GET", headers, body });
        response.statusCode = upstream.status;
        upstream.headers.forEach((value, name) => {
            if (!["content-length", "connection", "transfer-encoding"].includes(name)) response.setHeader(name, value);
        });
        response.setHeader("access-control-allow-origin", "*");
        response.end(new Uint8Array(await upstream.arrayBuffer()));
    }
    catch (error) {
        response.statusCode = 502;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "AI proxy request failed" }));
    }
}
function aiProxyPlugin() {
    const attach = (server) => {
        server.middlewares.use("/api/ai-proxy", (request, response, next) => { void handleAiProxy(request, response, next); });
    };
    return { name: "another-world-ai-proxy", configureServer: attach, configurePreviewServer: attach };
}
export default defineConfig({
    plugins: [react(), aiProxyPlugin()],
    test: {
        environment: "jsdom",
        setupFiles: "./src/testSetup.ts",
        css: true,
    },
});
