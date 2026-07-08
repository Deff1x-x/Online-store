import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

export type ApiErrorPayload = {
  message?: string;
  code?: string;
  details?: unknown;
};

export class APIError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "APIError";
    this.status = options.status ?? 0;
    this.code = options.code;
    this.details = options.details;
  }

  static fromPayload(status: number, payload: ApiErrorPayload | null) {
    return new APIError(payload?.message ?? "Request failed", {
      status,
      code: payload?.code,
      details: payload?.details,
    });
  }
}

export type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
}>;

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(this.state.error);
    }

    return this.props.fallback ?? null;
  }
}
