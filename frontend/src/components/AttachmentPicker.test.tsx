import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttachmentPicker from './AttachmentPicker';
import * as filesApi from '../api/files';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeFile(name: string, content = 'x') {
  return new File([content], name, { type: 'image/png' });
}

describe('AttachmentPicker', () => {
  it('uploads a selected file and reports the new chip via onChange', async () => {
    vi.spyOn(filesApi, 'uploadFile').mockResolvedValue({ id: 'f1', fileName: 'مدرک.png', sizeBytes: 1024 });
    const onChange = vi.fn();

    render(<AttachmentPicker value={[]} onChange={onChange} />);
    const input = screen.getByLabelText('افزودن سند', { selector: 'input' }) as HTMLInputElement;
    await userEvent.upload(input, makeFile('مدرک.png'));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { id: 'f1', fileName: 'مدرک.png', mimeType: 'image/png', sizeBytes: 1024 },
      ]),
    );
  });

  it('shows an inline error and does not call onChange when the upload is rejected', async () => {
    vi.spyOn(filesApi, 'uploadFile').mockRejectedValue(new Error('فقط PDF یا تصویر (PNG/JPG) مجاز است.'));
    const onChange = vi.fn();

    render(<AttachmentPicker value={[]} onChange={onChange} />);
    const input = screen.getByLabelText('افزودن سند', { selector: 'input' }) as HTMLInputElement;
    await userEvent.upload(input, makeFile('bad.exe'));

    expect(await screen.findByRole('alert')).toHaveTextContent('فقط PDF یا تصویر (PNG/JPG) مجاز است.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removing an already-picked chip calls onChange with it filtered out', async () => {
    const onChange = vi.fn();
    render(
      <AttachmentPicker
        value={[{ id: 'f1', fileName: 'مدرک.png', mimeType: 'image/png', sizeBytes: 1024 }]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'حذف مدرک.png' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
