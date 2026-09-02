import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InternalAuthGuard } from './common/internal-auth.guard';
import {
  RequestIdMiddleware,
  requestIdFromHeader,
} from './common/request-id.middleware';
import { validateEnv } from './config/env.validation';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { BlogModule } from './blog/blog.module';
import { SiteContentModule } from './site-content/site-content.module';
import { CareersModule } from './careers/careers.module';
import { FilesModule } from './files/files.module';
import { SupportModule } from './support/support.module';
import { SurveyModule } from './survey/survey.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        genReqId: (request) =>
          requestIdFromHeader(request.headers['x-request-id']),
        customProps: (request) => ({
          requestId: request.id,
          service: 'blujet-experience',
        }),
        redact: [
          'req.headers.x-internal-token',
          'req.headers.authorization',
          'req.body.phone',
          'req.body.body',
          'req.body.email',
          'req.body.nationalId',
          'req.body.passportNumber',
          'req.body.callerPhone',
          'req.body.input.phone',
          'req.body.input.email',
          'req.body.input.nationalId',
          'req.body.input.residenceAddress',
          'req.body.input.body',
          'req.body.input.comment',
          'req.body.file.contentBase64',
          'req.body.resume.contentBase64',
          'req.body.bookings[*].contactPhone',
        ],
      },
    }),
    DatabaseModule,
    BlogModule,
    SiteContentModule,
    CareersModule,
    FilesModule,
    SupportModule,
    SurveyModule,
    ContactModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalAuthGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
