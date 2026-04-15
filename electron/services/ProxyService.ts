import http from "http";
import net from "net";
import { createProxyMiddleware } from "http-proxy-middleware";
import log from "../log";
import type { ProxyStatus } from "../types";

const STRIPPED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "x-content-security-policy",
  "content-security-policy-report-only",
];

interface DedicatedProxy {
  server: http.Server;
  port: number;
  targetPort: number;
}

/**
 * Creates a dedicated micro-proxy server per instance.
 * Each proxy gets its own port (OS-assigned) and forwards ALL traffic
 * to the target localhost port without path rewriting.
 * This fixes VS Code serve-web which uses absolute paths for assets.
 */
export class ProxyService {
  private proxies = new Map<string, DedicatedProxy>();

  async startProxy(instanceId: string, targetPort: number): Promise<ProxyStatus> {
    // Stop existing proxy for this instance if any
    this.stopProxy(instanceId);

    const target = `http://127.0.0.1:${targetPort}`;

    const middleware = createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      on: {
        proxyRes: (proxyRes) => {
          for (const header of STRIPPED_HEADERS) {
            delete proxyRes.headers[header];
          }
        },
      },
    });

    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    });

    server.on("upgrade", (req, socket, head) => {
      middleware.upgrade!(req, socket as net.Socket, head);
    });

    // Port 0 = OS assigns a free port
    const proxyPort = await new Promise<number>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        resolve(addr.port);
      });
      server.on("error", reject);
    });

    this.proxies.set(instanceId, { server, port: proxyPort, targetPort });
    log.info(`[ProxyService] micro-proxy ${instanceId} :${proxyPort} -> :${targetPort}`);

    return {
      instance_id: instanceId,
      proxy_port: proxyPort,
      target_port: targetPort,
      running: true,
    };
  }

  stopProxy(instanceId: string): void {
    const proxy = this.proxies.get(instanceId);
    if (!proxy) return;

    proxy.server.close();
    this.proxies.delete(instanceId);
    log.info(`[ProxyService] stopped micro-proxy ${instanceId}`);
  }

  list(): ProxyStatus[] {
    const result: ProxyStatus[] = [];
    for (const [id, proxy] of this.proxies) {
      result.push({
        instance_id: id,
        proxy_port: proxy.port,
        target_port: proxy.targetPort,
        running: true,
      });
    }
    return result;
  }

  stopAll(): void {
    for (const [, proxy] of this.proxies) {
      proxy.server.close();
    }
    this.proxies.clear();
    log.info("[ProxyService] stopped all micro-proxies");
  }

  count(): number {
    return this.proxies.size;
  }
}
