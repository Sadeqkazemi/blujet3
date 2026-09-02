import { render, screen } from '@testing-library/react';
import ConversationHistory from './ConversationHistory';

describe('ConversationHistory', () => {
  it('renders a chronological conversation and its attachment', () => {
    render(
      <ConversationHistory
        title="تاریخچه پیام‌ها و اقدامات"
        items={[
          {
            id: 'one',
            title: 'ثبت پیام',
            body: 'متن پیام آزمایشی',
            actor: 'کاربر تست',
            createdAt: '2026-08-27T08:00:00.000Z',
            attachments: [
              { id: 'file-1', fileName: 'document.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('region', { name: 'تاریخچه پیام‌ها و اقدامات' })).toHaveTextContent(
      'متن پیام آزمایشی',
    );
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });
});
