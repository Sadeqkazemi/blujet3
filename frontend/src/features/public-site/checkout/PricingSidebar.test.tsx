import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PricingSidebar from './PricingSidebar';

describe('PricingSidebar seat selection pricing', () => {
  it('includes the current seat-type amount in the visible grand total', () => {
    render(
      <MemoryRouter>
      <PricingSidebar
        locale="fa"
        priceIrr="50000000"
        paxCount={1}
        passengerMix={{ adults: 1, children: 0, infants: 0 }}
        extras={[]}
        seatSelectionIrr="8000000"
        nextLabel="ادامه"
        onNext={() => undefined}
        canBack={false}
      />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('seat-selection-price-row')).toHaveTextContent('۸۰۰٬۰۰۰');
    expect(screen.getByTestId('checkout-pricing-total')).toHaveTextContent('۵٬۸۰۰٬۰۰۰');
  });

  it('does not charge or render an ancillary service until the passenger selects it', () => {
    render(
      <MemoryRouter>
        <PricingSidebar
          locale="en"
          priceIrr="50000000"
          paxCount={1}
          passengerMix={{ adults: 1, children: 0, infants: 0 }}
          extras={[{
            id: 'bag', code: 'EXTRA_BAGGAGE', titleFa: 'بار اضافه',
            titleEn: 'Extra baggage', titleAr: 'أمتعة إضافية',
            descriptionFa: null, descriptionEn: null, descriptionAr: null,
            billingUnit: 'PER_BOOKING', priceIrr: '2000000', selected: false, quantity: 1,
          }]}
          nextLabel="Continue"
          onNext={() => undefined}
          canBack={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Extra baggage')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-pricing-total')).toHaveTextContent('5,000,000');
  });
});
