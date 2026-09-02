import {
  DEFAULT_SOCIAL_LINKS,
  normalizeSocialUrl,
  parseSocialLinks,
  publicSocialLinks,
} from './social-links.util';

describe('social-links.util', () => {
  it('parses and validates a socialLinks patch', () => {
    const parsed = parseSocialLinks([
      {
        id: 'instagram',
        name: 'اینستاگرام blujet',
        url: 'instagram.com/blujet',
        enabled: true,
      },
      { id: 'telegram', enabled: false },
    ]);
    expect(parsed.find((l) => l.id === 'instagram')).toMatchObject({
      name: 'اینستاگرام blujet',
      url: 'instagram.com/blujet',
      enabled: true,
    });
    expect(parsed.find((l) => l.id === 'whatsapp')?.enabled).toBe(false);
  });

  it('rejects enabled link without url', () => {
    expect(() =>
      parseSocialLinks([{ id: 'instagram', enabled: true, url: '  ' }]),
    ).toThrow(/requires a url/);
  });

  it('normalizes bare hostnames to https', () => {
    expect(normalizeSocialUrl('t.me/blujet')).toBe('https://t.me/blujet');
  });

  it('publicSocialLinks filters disabled and empty urls', () => {
    const links = publicSocialLinks(
      DEFAULT_SOCIAL_LINKS.map((l) =>
        l.id === 'instagram'
          ? { ...l, url: 'instagram.com/blujet', enabled: true }
          : l,
      ),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe('https://instagram.com/blujet');
  });
});
