import { ApiConfigurationError, ApiContractError, ApiHttpError } from "../api";
import type { ResourceState, UiError } from "./types";

export function loadingResource<T>(): ResourceState<T> {
  return { status: "loading", data: null, error: null };
}

export function readyResource<T>(data: T): ResourceState<T> {
  return { status: "ready", data, error: null };
}

export function beginResourceRequest<T>(
  previous: ResourceState<T>,
): ResourceState<T> {
  return {
    status: previous.data === null ? "loading" : "refreshing",
    data: previous.data,
    error: null,
  };
}

export function failResource<T>(
  previous: ResourceState<T>,
  error: unknown,
): ResourceState<T> {
  return {
    status: "error",
    data: previous.data,
    error: sanitizeUiError(error),
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function sanitizeUiError(error: unknown): UiError {
  if (isAbortError(error)) {
    return {
      code: "aborted",
      title: "更新を中止しました",
      detail: "新しい条件でデータを取得しています。",
      retryable: true,
    };
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return {
      code: "timeout",
      title: "応答に時間がかかっています",
      detail: "少し待ってから、もう一度お試しください。",
      retryable: true,
    };
  }
  if (error instanceof ApiConfigurationError) {
    return {
      code: "configuration",
      title: "ダッシュボードを準備できません",
      detail: "サーバー側の接続設定を確認してください。",
      retryable: false,
    };
  }
  if (error instanceof ApiContractError) {
    return {
      code: "contract",
      title: "データを読み取れませんでした",
      detail: "APIの応答形式を確認してください。",
      retryable: true,
    };
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 400 || error.status === 422) {
      return {
        code: "invalidRequest",
        title: "指定した期間を取得できません",
        detail: "期間を確認して、もう一度お試しください。",
        retryable: false,
      };
    }
    if (error.status === 503) {
      return {
        code: "notReady",
        title: "収集サービスを準備しています",
        detail: "しばらく待つと自動的に再取得します。",
        retryable: true,
      };
    }
    return {
      code: "unavailable",
      title: "データを取得できませんでした",
      detail: "取得済みの値がある場合は、そのまま表示しています。",
      retryable: true,
    };
  }
  if (error instanceof TypeError) {
    return {
      code: "unavailable",
      title: "データを取得できませんでした",
      detail: "ネットワークまたは収集サービスの状態を確認してください。",
      retryable: true,
    };
  }
  return {
    code: "unknown",
    title: "予期しない問題が発生しました",
    detail: "少し待ってから、もう一度お試しください。",
    retryable: true,
  };
}

export function settledResource<T>(
  result: PromiseSettledResult<T>,
  previous: ResourceState<T> = loadingResource<T>(),
): ResourceState<T> {
  return result.status === "fulfilled"
    ? readyResource(result.value)
    : failResource(previous, result.reason);
}
