function pathWithoutQuery(value: unknown): string | undefined {
  return typeof value === 'string' ? value.split('?', 1)[0] : undefined;
}

/** Allow-list serializers: credentials and request bodies never enter logs. */
export function serializeLogRequest(value: unknown) {
  const req = value as {
    id?: unknown;
    method?: unknown;
    url?: unknown;
    raw?: { originalUrl?: unknown; ip?: unknown };
  };
  return {
    id: typeof req.id === 'string' ? req.id : undefined,
    method: typeof req.method === 'string' ? req.method : undefined,
    url: pathWithoutQuery(req.raw?.originalUrl) ?? pathWithoutQuery(req.url),
    realIp: typeof req.raw?.ip === 'string' ? req.raw.ip : undefined,
  };
}

export function serializeLogResponse(value: unknown) {
  const res = value as { statusCode?: unknown };
  return {
    statusCode: typeof res.statusCode === 'number' ? res.statusCode : undefined,
  };
}
