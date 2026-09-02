import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../database/entities/contact-message.entity';
import type { SubmitContactMessageDto } from './dto/contact.dto';

export interface ContactMessageView {
  id: string;
  name: string;
  phone: string;
  subject: string;
  body: string;
  createdAt: Date;
}

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
  ) {}

  async submit(dto: SubmitContactMessageDto): Promise<ContactMessageView> {
    return this.contactRepo.save(
      this.contactRepo.create({
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        subject: dto.subject.trim(),
        body: dto.body.trim(),
      }),
    );
  }

  async listRecent(): Promise<ContactMessageView[]> {
    return this.contactRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }
}
