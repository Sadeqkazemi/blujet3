import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const nginxConfig = readFileSync(join(repoRoot, 'frontend/nginx.conf'), 'utf8');
const nginxProxyConfig = readFileSync(
  join(repoRoot, 'frontend/nginx-api-proxy.conf'),
  'utf8',
);
const viteConfig = readFileSync(join(repoRoot, 'frontend/vite.config.ts'), 'utf8');

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

function backendControllerPrefixes(): string[] {
  const prefixes = new Set<string>();
  const controllerPattern = /@Controller\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const file of controllerFiles(join(repoRoot, 'backend/src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(controllerPattern)) {
      prefixes.add(match[1].split('/')[0]);
    }
  }

  return [...prefixes].sort();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('edge routing configuration', () => {
  it('routes every top-level backend controller prefix through production nginx', () => {
    for (const prefix of backendControllerPrefixes()) {
      expect(nginxConfig, `missing nginx API prefix: ${prefix}`).toMatch(
        new RegExp(`(?:\\(|\\|)${escapeRegex(prefix)}(?:\\||\\))`),
      );
    }
  });

  it('keeps shared SPA/API paths HTML-aware in dev and production', () => {
    const overlappingPrefixes = [
      'blog',
      'careers',
      'club',
      'contact',
      'flight-status',
      'manage-booking',
      'survey',
    ];
    const viteOverlapBlock = viteConfig.match(
      /const SPA_OVERLAPPING_PREFIXES[\s\S]*?\]\)/,
    )?.[0];
    const nginxOverlapBlock = nginxConfig.match(
      /# SPA_API_OVERLAP_START[\s\S]*?# SPA_API_OVERLAP_END/,
    )?.[0];

    expect(viteOverlapBlock).toBeDefined();
    expect(nginxOverlapBlock).toBeDefined();
    expect(nginxOverlapBlock).toContain('text/html');
    expect(nginxOverlapBlock).toContain('rewrite ^ /index.html last;');

    for (const prefix of overlappingPrefixes) {
      expect(viteOverlapBlock, `missing Vite overlap: ${prefix}`).toContain(
        `'${prefix}'`,
      );
      expect(nginxOverlapBlock, `missing nginx overlap: ${prefix}`).toMatch(
        new RegExp(`(?:\\(|\\|)${escapeRegex(prefix)}(?:\\||\\))`),
      );
    }
  });

  it('keeps gateway forwarding, timeout, and body-size protections active', () => {
    expect(nginxConfig).toContain('client_max_body_size 10m;');
    expect(nginxConfig).toContain('log_format gateway_json escape=json');
    expect(nginxConfig).toContain('"requestId":"$gateway_request_id"');
    expect(nginxConfig).toContain('error_page 413 = @payload_too_large;');
    expect(nginxConfig).toContain('"code":"PAYLOAD_TOO_LARGE"');
    for (const header of [
      'X-Real-IP',
      'X-Forwarded-For',
      'X-Forwarded-Proto',
      'X-Forwarded-Host',
      'X-Forwarded-Port',
    ]) {
      expect(nginxProxyConfig).toContain(`proxy_set_header ${header}`);
    }
    expect(nginxProxyConfig).toContain('proxy_connect_timeout 5s;');
    expect(nginxProxyConfig).toContain('proxy_read_timeout 35s;');
    expect(nginxProxyConfig).toContain('proxy_send_timeout 35s;');
    expect(nginxProxyConfig).toContain(
      'proxy_set_header X-Request-Id $gateway_request_id;',
    );
    expect(nginxProxyConfig).toContain('proxy_hide_header X-Request-Id;');
    expect(nginxProxyConfig).toContain(
      'add_header X-Request-Id $gateway_request_id always;',
    );
  });
});
