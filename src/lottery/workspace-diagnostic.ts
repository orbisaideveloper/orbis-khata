export type WorkspaceDiagnostic = Readonly<{
  startedAt: string;
  elapsedMs: number;
  build: string;
  stage: 'fetch' | 'body' | 'size' | 'json' | 'http' | 'domain' | 'shape' | 'timeout';
  status: number | null;
  decodedChars: number | null;
  contentLength: number | null;
  contentEncoding: string | null;
  requestId: string | null;
}>;

function safeLength(header: string | null | undefined): number | null {
  return header && /^\d{1,15}$/u.test(header) ? Number(header) : null;
}

export function workspaceDiagnostic(
  startedAt: number,
  stage: WorkspaceDiagnostic['stage'],
  response?: Response,
  decodedChars: number | null = null,
): WorkspaceDiagnostic {
  const encoding = response?.headers.get('content-encoding');
  const id = response?.headers.get('sb-request-id') ?? response?.headers.get('x-request-id');
  const build = import.meta.env.VITE_KHATA_WEB_RELEASE;
  return {
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs: Math.max(0, Date.now() - startedAt),
    build: typeof build === 'string' && /^[a-f0-9]{7,40}$/u.test(build) ? build : 'local',
    stage,
    status: response?.status ?? null,
    decodedChars,
    contentLength: safeLength(response?.headers.get('content-length')),
    contentEncoding: encoding && /^(?:gzip|br|deflate|zstd|identity)$/u.test(encoding) ? encoding : null,
    requestId: id && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id) ? id : null,
  };
}

export function workspaceDiagnosticFrom(error: unknown): WorkspaceDiagnostic | undefined {
  return error instanceof Error && 'workspaceDiagnostic' in error
    ? readWorkspaceDiagnostic(error.workspaceDiagnostic) : undefined;
}

export function readWorkspaceDiagnostic(input: unknown): WorkspaceDiagnostic | undefined {
  if (typeof input !== 'object' || input === null) return;
  const data = input as Partial<WorkspaceDiagnostic>;
  if (typeof data.startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(data.startedAt) ||
    !data.stage || !['fetch', 'body', 'size', 'json', 'http', 'domain', 'shape', 'timeout'].includes(data.stage)) return;
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    startedAt: data.startedAt,
    stage: data.stage,
    elapsedMs: count(data.elapsedMs) ?? 0,
    build: typeof data.build === 'string' && /^[a-f0-9]{7,40}$/u.test(data.build) ? data.build : 'local',
    status: typeof data.status === 'number' && Number.isInteger(data.status) && data.status >= 100 && data.status <= 599 ? data.status : null,
    decodedChars: count(data.decodedChars),
    contentLength: count(data.contentLength),
    contentEncoding: typeof data.contentEncoding === 'string' && /^(?:gzip|br|deflate|zstd|identity)$/u.test(data.contentEncoding) ? data.contentEncoding : null,
    requestId: typeof data.requestId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(data.requestId) ? data.requestId : null,
  };
}
