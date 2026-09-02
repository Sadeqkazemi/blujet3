import { Injectable, Logger } from '@nestjs/common';

export const ROUTE_DISTANCE_PROVIDER = Symbol('ROUTE_DISTANCE_PROVIDER');

export interface RouteDistanceAirport {
  code: string;
  cityFa: string;
  airportNameFa: string | null;
}

export interface RouteDistanceSuggestion {
  distanceKm: number;
  confidence: number;
  source: 'ANTHROPIC';
  generatedAt: string;
}

export interface RouteDistanceProvider {
  suggest(
    origin: RouteDistanceAirport,
    destination: RouteDistanceAirport,
  ): Promise<RouteDistanceSuggestion | null>;
}

const TIMEOUT_MS = 8_000;
const MODEL = 'claude-haiku-4-5-20251001';

@Injectable()
export class AnthropicRouteDistanceProvider implements RouteDistanceProvider {
  private readonly logger = new Logger(AnthropicRouteDistanceProvider.name);

  async suggest(
    origin: RouteDistanceAirport,
    destination: RouteDistanceAirport,
  ): Promise<RouteDistanceSuggestion | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const prompt = [
      'Estimate the airport-to-airport great-circle distance in kilometres.',
      'Return JSON only with this exact shape: {"distanceKm":1234,"confidence":0.95}.',
      'distanceKm must be a positive whole number and confidence must be from 0 to 1.',
      `Origin: ${origin.code} — ${origin.airportNameFa ?? origin.cityFa}.`,
      `Destination: ${destination.code} — ${destination.airportNameFa ?? destination.cityFa}.`,
    ].join('\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 80,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `Anthropic route distance returned ${response.status}`,
        );
        return null;
      }
      const body = (await response.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text = body.content
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      const json = text?.match(/\{[\s\S]*\}/)?.[0];
      if (!json) return null;
      const parsed = JSON.parse(json) as {
        distanceKm?: unknown;
        confidence?: unknown;
      };
      const distanceKm = Number(parsed.distanceKm);
      const confidence = Number(parsed.confidence);
      if (
        !Number.isInteger(distanceKm) ||
        distanceKm < 1 ||
        distanceKm > 20_000 ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1
      ) {
        return null;
      }
      return {
        distanceKm,
        confidence,
        source: 'ANTHROPIC',
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Anthropic route distance unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
