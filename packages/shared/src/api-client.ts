// Tiny isomorphic API client used by the RAGE MP server bridge.
// Relies on global `fetch` (Node 18+ / RAGE MP Node runtime).

export interface ApiClientOptions {
  baseUrl: string;
  defaultTimeoutMs?: number;
}

export class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeout = opts.defaultTimeoutMs ?? 8000;
  }

  async request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {})
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${path} ${res.status}: ${text}`);
      }
      // Some endpoints may return empty body
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) return undefined as unknown as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, token?: string) {
    return this.request<T>(path, { method: "GET" }, token);
  }
  post<T>(path: string, body: unknown, token?: string) {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }, token);
  }
}
