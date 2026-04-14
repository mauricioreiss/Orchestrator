import express from "express";
import http from "http";
import net from "net";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { ProxyStatus } from "../types";

const PROXY_PORT = 13333;
const STRIPPED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "x-content-security-policy",
  "content-security-policy-report-only",
];

export class ProxyService {
  private app: express.Express;
  private server: http.Server;
  private localTargets = new Map<string, number>();

  constructor() {
    this.app = express();

    // Localhost proxy route: /proxy/:instanceId/...
    this.app.use("/proxy/:instanceId", (req, res, next) => {
      const { instanceId } = req.params;
      const targetPort = this.localTargets.get(instanceId);

      if (targetPort == null) {
        res.status(404).json({ error: `No proxy registered for instance ${instanceId}` });
        return;
      }

      const middleware = createProxyMiddleware({
        target: `http://127.0.0.1:${targetPort}`,
        changeOrigin: true,
        ws: true,
        pathRewrite: (_path, req) => {
          const prefix = `/proxy/${instanceId}`;
          const original = (req as any).originalUrl ?? req.url ?? "";
          return original.startsWith(prefix) ? original.slice(prefix.length) || "/" : original;
        },
        on: {
          proxyRes: (proxyRes) => {
            this.stripHeaders(proxyRes);
          },
        },
      });

      middleware(req, res, next);
    });

    this.server = http.createServer(this.app);

    // Handle WebSocket upgrade for registered proxies
    this.server.on("upgrade", (req, socket, head) => {
      const url = req.url ?? "";

      const localMatch = url.match(/^\/proxy\/([^/]+)/);
      if (localMatch) {
        const instanceId = localMatch[1];
        const targetPort = this.localTargets.get(instanceId);
        if (targetPort == null) {
          socket.destroy();
          return;
        }

        const prefix = `/proxy/${instanceId}`;
        req.url = url.startsWith(prefix) ? url.slice(prefix.length) || "/" : url;

        const wsProxy = createProxyMiddleware({
          target: `http://127.0.0.1:${targetPort}`,
          changeOrigin: true,
          ws: true,
        });

        wsProxy.upgrade!(req, socket as net.Socket, head);
        return;
      }

      socket.destroy();
    });

    this.server.listen(PROXY_PORT, "127.0.0.1", () => {
      console.log(`[ProxyService] listening on 127.0.0.1:${PROXY_PORT}`);
    });
  }

  startProxy(instanceId: string, targetPort: number): ProxyStatus {
    this.localTargets.set(instanceId, targetPort);
    console.log(`[ProxyService] registered local proxy ${instanceId} -> 127.0.0.1:${targetPort}`);

    return {
      instance_id: instanceId,
      proxy_port: PROXY_PORT,
      target_port: targetPort,
      running: true,
    };
  }

  stopProxy(instanceId: string): void {
    if (this.localTargets.delete(instanceId)) {
      console.log(`[ProxyService] unregistered proxy ${instanceId}`);
    }
  }

  list(): ProxyStatus[] {
    const result: ProxyStatus[] = [];
    for (const [id, port] of this.localTargets) {
      result.push({
        instance_id: id,
        proxy_port: PROXY_PORT,
        target_port: port,
        running: true,
      });
    }
    return result;
  }

  stopAll(): void {
    this.localTargets.clear();
    this.server.close();
    console.log("[ProxyService] stopped all proxies and closed server");
  }

  count(): number {
    return this.localTargets.size;
  }

  private stripHeaders(proxyRes: http.IncomingMessage): void {
    for (const header of STRIPPED_HEADERS) {
      delete proxyRes.headers[header];
    }
  }
}
