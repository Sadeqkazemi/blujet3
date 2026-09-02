import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteContentBlock } from '../database/entities/site-content-block.entity';
import { SiteDestinationHighlight } from '../database/entities/site-destination-highlight.entity';
import { SiteMediaAsset } from '../database/entities/site-media-asset.entity';
import { SiteRouteHighlight } from '../database/entities/site-route-highlight.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import { SiteContentController } from './site-content.controller';
import { SiteContentService } from './site-content.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoredFile,
      SiteMediaAsset,
      SiteContentBlock,
      SiteDestinationHighlight,
      SiteRouteHighlight,
    ]),
  ],
  controllers: [SiteContentController],
  providers: [SiteContentService],
})
export class SiteContentModule {}
