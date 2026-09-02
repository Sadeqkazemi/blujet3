import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  PssCapabilities,
  PssClient,
  PssShadowReport,
  PssShadowSnapshot,
} from './pss-client.interface';

@Injectable()
export class HttpPssClient implements PssClient {
  constructor(private readonly config: ConfigService) {}

  async getCapabilities(
    requestId: string = randomUUID(),
  ): Promise<PssCapabilities> {
    this.assertEnabled();
    return this.request<PssCapabilities>(
      '/internal/v1/capabilities',
      requestId,
    );
  }

  async reconcileShadow(
    snapshot: PssShadowSnapshot,
    requestId: string = randomUUID(),
  ): Promise<PssShadowReport> {
    this.assertEnabled();
    return this.request<PssShadowReport>(
      '/internal/v1/reconciliation/shadow',
      requestId,
      snapshot,
    );
  }

  private assertEnabled(): void {
    if (this.config.get('PSS_INTEGRATION_ENABLED', 'false') !== 'true') {
      throw new ServiceUnavailableException({
        code: 'PSS_INTEGRATION_DISABLED',
      });
    }
  }

  private async request<T>(
    path: string,
    requestId: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = this.config.getOrThrow<string>('PSS_SERVICE_URL');
    const token = this.config.getOrThrow<string>('PSS_INTERNAL_TOKEN');
    const timeout = Number(this.config.get('PSS_REQUEST_TIMEOUT_MS', '3000'));
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-internal-token': token,
          'x-request-id': requestId,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error(`PSS returned ${response.status}`);
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException({ code: 'PSS_UNAVAILABLE' });
    }
  }
}
