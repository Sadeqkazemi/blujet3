import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AgencyProfile } from './agency-profile.entity';
import { User } from './user.entity';

@Index('agency_messages_agencyId_createdAt_idx', ['agencyId', 'createdAt'])
@Entity('agency_messages')
export class AgencyMessage {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_messages_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  agencyId!: string;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'agency_messages_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'text' })
  senderId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'senderId',
    foreignKeyConstraintName: 'agency_messages_senderId_fkey',
  })
  sender!: User;

  @Column({ type: 'boolean' })
  senderIsAgency!: boolean;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: string[] | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
