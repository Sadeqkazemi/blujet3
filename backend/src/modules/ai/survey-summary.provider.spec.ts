import { AnthropicSurveySummaryProvider } from './survey-summary.provider';

describe('AnthropicSurveySummaryProvider (unit)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new AnthropicSurveySummaryProvider();
    expect(await provider.summarize(['خیلی خوب بود'])).toBeNull();
  });

  it('returns null for an empty comment list, without calling fetch', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    const provider = new AnthropicSurveySummaryProvider();
    expect(await provider.summarize([])).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the Anthropic API responds with a non-2xx status', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const provider = new AnthropicSurveySummaryProvider();
    expect(await provider.summarize(['بد بود'])).toBeNull();
  });

  it('returns null when fetch throws (e.g. timeout/network failure)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const provider = new AnthropicSurveySummaryProvider();
    expect(await provider.summarize(['بد بود'])).toBeNull();
  });

  it('returns the real summary + real token usage on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'در کل رضایت بالا بود.' }],
          usage: { input_tokens: 42, output_tokens: 8 },
        }),
    });
    const provider = new AnthropicSurveySummaryProvider();
    const result = await provider.summarize(['عالی بود', 'صندلی راحت نبود']);
    expect(result).toEqual({
      summary: 'در کل رضایت بالا بود.',
      inputTokens: 42,
      outputTokens: 8,
    });
  });
});
