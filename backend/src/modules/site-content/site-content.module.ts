import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { SiteMediaAsset } from '../../database/entities/site-media-asset.entity';
import { SiteContentBlock } from '../../database/entities/site-content-block.entity';
import { SiteDestinationHighlight } from '../../database/entities/site-destination-highlight.entity';
import { SiteRouteHighlight } from '../../database/entities/site-route-highlight.entity';
import { Airport } from '../../database/entities/airport.entity';
import { BlogPost } from '../../database/entities/blog-post.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { SiteContentAdminController } from './site-content-admin.controller';
import { SiteContentPublicController } from './site-content-public.controller';
import { SiteContentService } from './site-content.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoredFile,
      SiteMediaAsset,
      SiteContentBlock,
      SiteDestinationHighlight,
      SiteRouteHighlight,
      Airport,
      BlogPost,
      FlightInstance,
    ]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [SiteContentAdminController, SiteContentPublicController],
  providers: [SiteContentService],
  exports: [SiteContentService],
})
export class SiteContentModule {}
