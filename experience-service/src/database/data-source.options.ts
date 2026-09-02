import type { DataSourceOptions } from 'typeorm';
import { ContactMessage } from './entities/contact-message.entity';
import { BlogPost } from './entities/blog-post.entity';
import { StoredFile } from './entities/stored-file.entity';
import { SiteContentBlock } from './entities/site-content-block.entity';
import { SiteDestinationHighlight } from './entities/site-destination-highlight.entity';
import { SiteMediaAsset } from './entities/site-media-asset.entity';
import { SiteRouteHighlight } from './entities/site-route-highlight.entity';
import { CareersSettings } from './entities/careers-settings.entity';
import { JobApplication } from './entities/job-application.entity';
import { JobPosting } from './entities/job-posting.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SurveyInvite } from './entities/survey-invite.entity';
import { SurveyQuestion } from './entities/survey-question.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveySettings } from './entities/survey-settings.entity';

export function dataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.EXPERIENCE_DATABASE_URL,
    entities: [
      ContactMessage,
      BlogPost,
      StoredFile,
      SiteContentBlock,
      SiteDestinationHighlight,
      SiteMediaAsset,
      SiteRouteHighlight,
      CareersSettings,
      JobApplication,
      JobPosting,
      SupportTicket,
      SurveySettings,
      SurveyQuestion,
      SurveyInvite,
      SurveyResponse,
    ],
    synchronize: false,
  };
}
