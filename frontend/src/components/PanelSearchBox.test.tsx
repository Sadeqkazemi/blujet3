import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PanelSearchBox from './PanelSearchBox';
import type { PanelNavItem } from '../types/panels';

const nav: PanelNavItem[] = [
  { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
  { key: 'cartable', labelFa: 'کارتابل', implemented: true },
  { key: 'refund', labelFa: 'استرداد بلیط', implemented: true },
];

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/panel']}>
      <Routes>
        <Route path="/panel" element={<PanelSearchBox nav={nav} />} />
        <Route path="/panel/cartable" element={<div>صفحه کارتابل</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PanelSearchBox', () => {
  it('filters real nav items as the user types', () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('جستجو…'), { target: { value: 'کارتابل' } });

    expect(screen.getByRole('button', { name: 'کارتابل' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'استرداد بلیط' })).not.toBeInTheDocument();
  });

  it('shows a not-found message when nothing matches', () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('جستجو…'), { target: { value: 'zzz' } });
    expect(screen.getByText('صفحه‌ای یافت نشد.')).toBeInTheDocument();
  });

  it('navigates to the picked page on click', () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('جستجو…'), { target: { value: 'کارتابل' } });
    fireEvent.click(screen.getByRole('button', { name: 'کارتابل' }));

    expect(screen.getByText('صفحه کارتابل')).toBeInTheDocument();
  });
});
