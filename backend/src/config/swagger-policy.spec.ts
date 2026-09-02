import { isSwaggerEnabled } from './swagger-policy';

describe('isSwaggerEnabled', () => {
  it('keeps API documentation available outside production', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('keeps API documentation closed by default in production', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toBe(false);
  });
});
