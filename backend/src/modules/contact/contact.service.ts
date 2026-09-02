import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import type { SubmitContactMessageDto } from './dto/contact.dtos';
import { ExperienceInternalClient } from '../experience-client/experience-internal.client';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
    private readonly experience: ExperienceInternalClient,
  ) {}

  async submit(dto: SubmitContactMessageDto) {
    if (this.experience.enabled()) {
      return this.experience.submitContact(dto);
    }
    return this.contactRepo.save(this.contactRepo.create(dto));
  }

  /** Recent inbox for SiteAdminDashboardPage's third section — see
   * docs/DB_SCHEMA.md's Phase 20 notes for why there is no dedicated
   * review UI (no design admin tab exists specifically for this). */
  async listRecent() {
    if (this.experience.enabled()) {
      return this.experience.listRecentContact();
    }
    return this.contactRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }
}
