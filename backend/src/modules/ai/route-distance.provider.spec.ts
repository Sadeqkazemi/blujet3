import { AnthropicRouteDistanceProvider } from './route-distance.provider';

const origin = { code: 'IKA', cityFa: 'تهران', airportNameFa: null };
const destination = { code: 'MCT', cityFa: 'مسقط', airportNameFa: null };

describe('AnthropicRouteDistanceProvider', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it('degrades to null when the provider is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new AnthropicRouteDistanceProvider();

    await expect(provider.suggest(origin, destination)).resolves.toBeNull();
  });

  it('accepts only validated whole-kilometre advisory JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '{"distanceKm":1492,"confidence":0.94}',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new AnthropicRouteDistanceProvider();

    await expect(provider.suggest(origin, destination)).resolves.toMatchObject({
      distanceKm: 1492,
      confidence: 0.94,
      source: 'ANTHROPIC',
    });
  });

  it('rejects malformed or implausible provider output', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: '{"distanceKm":99999,"confidence":5}' },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new AnthropicRouteDistanceProvider();

    await expect(provider.suggest(origin, destination)).resolves.toBeNull();
  });
});
