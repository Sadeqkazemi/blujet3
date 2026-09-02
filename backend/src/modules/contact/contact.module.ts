import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ExperienceClientModule } from '../experience-client/experience-client.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContactMessage]), ExperienceClientModule],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
