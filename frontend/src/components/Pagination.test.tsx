import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import Pagination from './Pagination';
import { usePagination, PANEL_PAGE_SIZE } from '../hooks/usePagination';

describe('usePagination', () => {
  it('pages items in chunks of 10', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagination(items));
    expect(PANEL_PAGE_SIZE).toBe(10);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    act(() => result.current.setPage(2));
    expect(result.current.pageItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps page when the list shrinks', () => {
    let items = Array.from({ length: 25 }, (_, i) => i);
    const { result, rerender } = renderHook(({ list }) => usePagination(list), {
      initialProps: { list: items },
    });
    act(() => result.current.setPage(3));
    items = Array.from({ length: 5 }, (_, i) => i);
    rerender({ list: items });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });
});

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('navigates with قبلی / بعدی and page buttons', async () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={4} onChange={onChange} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'قبلی' }));
    expect(onChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(onChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: '۴' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('uses the supplied locale formatter for page numbers', () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        onChange={vi.fn()}
        formatPage={(value) => String(value)}
      />,
    );

    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '۱' })).not.toBeInTheDocument();
  });
});
