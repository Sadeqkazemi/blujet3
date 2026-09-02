import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExtraBaggageInfoPage,
  PetTravelInfoPage,
  RefundInfoPage,
  SeatSelectionInfoPage,
  WheelchairInfoPage,
} from './PublicServicePages';
import * as useAuthModule from '../../../hooks/useAuth';
import * as useIsMobileModule from '../../../hooks/useIsMobile';
import * as useLocaleModule from '../../../hooks/useLocale';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ServiceInfoPage responsive', () => {
  it('collapses the hero and step grids to a single column on mobile', () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SeatSelectionInfoPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('service-info-page')).toBeInTheDocument();
    expect(screen.getByTestId('service-hero-grid')).toHaveStyle({
      gridTemplateColumns: '1fr',
    });
  });

  const servicePages = [
    ['seat selection', SeatSelectionInfoPage],
    ['extra baggage', ExtraBaggageInfoPage],
    ['ticket refund', RefundInfoPage],
    ['pet travel', PetTravelInfoPage],
    ['wheelchair', WheelchairInfoPage],
  ] as const;

  it.each(servicePages)('renders Latin step digits in English on %s', (_name, Page) => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'en', setLocale: vi.fn() });
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('۱')).not.toBeInTheDocument();
    expect(screen.queryByText('۲')).not.toBeInTheDocument();
    expect(screen.queryByText('۳')).not.toBeInTheDocument();
  });

  it.each(servicePages)('renders Arabic step digits in Arabic on %s', (_name, Page) => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'ar', setLocale: vi.fn() });
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );

    expect(screen.getByText('١')).toBeInTheDocument();
    expect(screen.getByText('٢')).toBeInTheDocument();
    expect(screen.getByText('٣')).toBeInTheDocument();
    expect(screen.queryByText('۱')).not.toBeInTheDocument();
    expect(screen.queryByText('۲')).not.toBeInTheDocument();
    expect(screen.queryByText('۳')).not.toBeInTheDocument();
  });
});
