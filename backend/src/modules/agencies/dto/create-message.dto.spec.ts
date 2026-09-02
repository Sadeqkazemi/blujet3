import { validate } from 'class-validator';
import { CreateMessageDto } from './create-message.dto';

describe('CreateMessageDto attachments', () => {
  it('accepts unique file UUIDs uploaded by the message sender', async () => {
    const dto = Object.assign(new CreateMessageDto(), {
      body: 'مدارک درخواست پیوست شد.',
      attachmentIds: ['2d0bd438-397b-4db8-97c9-df26ebc94942'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid or duplicate attachment identifiers', async () => {
    const invalid = Object.assign(new CreateMessageDto(), {
      body: 'مدرک',
      attachmentIds: ['not-a-file-id'],
    });
    const duplicate = Object.assign(new CreateMessageDto(), {
      body: 'مدرک',
      attachmentIds: [
        '2d0bd438-397b-4db8-97c9-df26ebc94942',
        '2d0bd438-397b-4db8-97c9-df26ebc94942',
      ],
    });

    expect(await validate(invalid)).not.toHaveLength(0);
    expect(await validate(duplicate)).not.toHaveLength(0);
  });
});
