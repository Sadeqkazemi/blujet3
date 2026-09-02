export interface ApiError {
  code: string;
  message: string;
}

export interface ApiListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiListMeta;
}

export interface ApiPagedResult<T> {
  data: T;
  meta: ApiListMeta;
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
