import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import type { SubmitContactMessageDto } from './dto/contact.dtos';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
  ) {}

  async submit(dto: SubmitContactMessageDto) {
    return this.contactRepo.save(this.contactRepo.create(dto));
  }

  /** Recent inbox for SiteAdminDashboardPage's third section — see
   * docs/DB_SCHEMA.md's Phase 20 notes for why there is no dedicated
   * review UI (no design admin tab exists specifically for this). */
  async listRecent() {
    return this.contactRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }
}
