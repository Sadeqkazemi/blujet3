import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { PublicOfferFacadeController } from './public-offer-facade.controller';

describe('PublicOfferFacadeController', () => {
  it('protects the route for authenticated customers and agencies only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PublicOfferFacadeController)).toEqual(
      ['USER', 'AGENCY'],
    );
  });

  it('keeps the route at search/offers', () => {
    expect(Reflect.getMetadata('path', PublicOfferFacadeController)).toBe(
      'search',
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      PublicOfferFacadeController.prototype,
      'search',
    );
    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata('path', descriptor?.value as object)).toBe(
      'offers',
    );
  });
});
