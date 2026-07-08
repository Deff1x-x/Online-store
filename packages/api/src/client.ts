import { DEFAULT_REQUEST_TIMEOUT_MS } from "./config";
import { APIError, type ApiErrorPayload } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export type ApiRequestOptions<TBody = unknown> = {
  method?: HttpMethod;
  path: string;
  body?: TBody;
  query?: QueryParams;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  auth?: boolean;
  skipAuthRefresh?: boolean;
  suppressErrorNotification?: boolean;
};

export type ApiClientOptions = {
  baseURL: string;
  headers?: HeadersInit;
  timeoutMs?: number;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => Promise<boolean>;
  onError?: (error: APIError) => void;
};

type ParsedResponse = {
  data: unknown;
  headers: Headers;
};

export class ApiClient {
  private baseURL: string;
  private headers: HeadersInit;
  private timeoutMs: number;
  private getAccessToken?: () => string | null;
  private onUnauthorized?: () => Promise<boolean>;
  private onError?: (error: APIError) => void;

  constructor(options: ApiClientOptions) {
    this.baseURL = options.baseURL.replace(/\/+$/, "");
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.onError = options.onError;
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL.replace(/\/+$/, "");
  }

  setAuthHandlers(handlers: Pick<ApiClientOptions, "getAccessToken" | "onUnauthorized">) {
    this.getAccessToken = handlers.getAccessToken;
    this.onUnauthorized = handlers.onUnauthorized;
  }

  setErrorHandler(handler?: (error: APIError) => void) {
    this.onError = handler;
  }

  async get<TResponse>(path: string, options: Omit<ApiRequestOptions, "method" | "path"> = {}) {
    return this.request<TResponse>({ ...options, method: "GET", path });
  }

  async post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<ApiRequestOptions<TBody>, "method" | "path" | "body"> = {},
  ) {
    return this.request<TResponse, TBody>({ ...options, method: "POST", path, body });
  }

  async put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<ApiRequestOptions<TBody>, "method" | "path" | "body"> = {},
  ) {
    return this.request<TResponse, TBody>({ ...options, method: "PUT", path, body });
  }

  async patch<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<ApiRequestOptions<TBody>, "method" | "path" | "body"> = {},
  ) {
    return this.request<TResponse, TBody>({ ...options, method: "PATCH", path, body });
  }

  async delete<TResponse>(path: string, options: Omit<ApiRequestOptions, "method" | "path"> = {}) {
    return this.request<TResponse>({ ...options, method: "DELETE", path });
  }

  async request<TResponse, TBody = unknown>(options: ApiRequestOptions<TBody>): Promise<TResponse> {
    try {
      return await this.execute<TResponse, TBody>(options);
    } catch (error) {
      const apiError =
        error instanceof APIError
          ? error
          : new APIError(error instanceof Error ? error.message : "Request failed");

      if (!options.suppressErrorNotification) {
        this.onError?.(apiError);
      }

      throw apiError;
    }
  }

  private async execute<TResponse, TBody = unknown>(options: ApiRequestOptions<TBody>): Promise<TResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = globalThis.setTimeout(
      () => {
        timedOut = true;
        controller.abort(new DOMException("Request timed out", "AbortError"));
      },
      options.timeoutMs ?? this.timeoutMs,
    );

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener("abort", () => controller.abort(options.signal?.reason), { once: true });
      }
    }

    try {
      const response = await fetch(this.createUrl(options.path, options.query), {
        method: options.method ?? "GET",
        headers: this.createHeaders(options),
        body: this.createBody(options.body),
        signal: controller.signal,
      });

      const parsed = await this.parseResponse(response);

      if (response.status === 401 && !options.skipAuthRefresh && this.onUnauthorized) {
        const refreshed = await this.onUnauthorized();
        if (refreshed) {
          return this.execute<TResponse, TBody>({ ...options, skipAuthRefresh: true });
        }
      }

      if (!response.ok) {
        throw APIError.fromPayload(response.status, parsed.data as ApiErrorPayload | null);
      }

      return parsed.data as TResponse;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new APIError(timedOut ? "Request timed out" : "Request aborted", {
          code: timedOut ? "request_timeout" : "request_aborted",
        });
      }

      throw new APIError(error instanceof Error ? error.message : "Network request failed", {
        code: "network_error",
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  private createUrl(path: string, query?: QueryParams) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseURL}${normalizedPath}`);

    Object.entries(query ?? {}).forEach(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((item) => {
        if (item !== null && item !== undefined) {
          url.searchParams.append(key, String(item));
        }
      });
    });

    return url.toString();
  }

  private createHeaders<TBody>(options: ApiRequestOptions<TBody>) {
    const headers = new Headers(this.headers);
    const optionHeaders = new Headers(options.headers);

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    optionHeaders.forEach((value, key) => headers.set(key, value));

    if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = options.auth === false ? null : this.getAccessToken?.();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }

  private createBody(body: unknown) {
    if (body === undefined || body === null) {
      return undefined;
    }

    if (body instanceof FormData || body instanceof Blob || typeof body === "string") {
      return body;
    }

    return JSON.stringify(body);
  }

  private async parseResponse(response: Response): Promise<ParsedResponse> {
    if (response.status === 204) {
      return { data: null, headers: response.headers };
    }

    const text = await response.text();
    if (!text) {
      return { data: null, headers: response.headers };
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return { data: JSON.parse(text), headers: response.headers };
    }

    return { data: text, headers: response.headers };
  }
}

export function createApiClient(options: ApiClientOptions) {
  return new ApiClient(options);
}
