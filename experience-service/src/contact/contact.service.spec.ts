import type { Repository } from 'typeorm';
import { ContactMessage } from '../database/entities/contact-message.entity';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  const saved = {
    id: 'message-id',
    name: 'کاربر',
    phone: '09121234567',
    subject: 'موضوع',
    body: 'متن پیام',
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
  };

  function setup() {
    const create = jest.fn((value: object) => value);
    const save = jest.fn().mockResolvedValue(saved);
    const find = jest.fn().mockResolvedValue([saved]);
    const repo = {
      create,
      save,
      find,
    } as unknown as Repository<ContactMessage>;
    return { service: new ContactService(repo), create, find };
  }

  it('trims and persists a contact message', async () => {
    const { service, create } = setup();
    await expect(
      service.submit({
        name: ' کاربر ',
        phone: ' 09121234567 ',
        subject: ' موضوع ',
        body: ' متن پیام ',
      }),
    ).resolves.toEqual(saved);
    expect(create).toHaveBeenCalledWith({
      name: 'کاربر',
      phone: '09121234567',
      subject: 'موضوع',
      body: 'متن پیام',
    });
  });

  it('returns at most the latest twenty messages', async () => {
    const { service, find } = setup();
    await expect(service.listRecent()).resolves.toEqual([saved]);
    expect(find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      take: 20,
    });
  });
});
