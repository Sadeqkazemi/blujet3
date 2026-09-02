import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttachmentList from './AttachmentList';
import * as filesApi from '../api/files';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AttachmentList', () => {
  it('renders nothing when there are no attachments', () => {
    const { container } = render(<AttachmentList attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('clicking a chip downloads the file by id and name', async () => {
    const downloadSpy = vi.spyOn(filesApi, 'downloadFile').mockResolvedValue(undefined);
    render(
      <AttachmentList
        attachments={[{ id: 'f1', fileName: 'مدرک.png', mimeType: 'image/png', sizeBytes: 1024 }]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'مدرک.png' }));
    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith('f1', 'مدرک.png'));
  });
});
