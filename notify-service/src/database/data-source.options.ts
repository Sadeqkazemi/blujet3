import type { DataSourceOptions } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { SmsLog } from './entities/sms-log.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.NOTIFY_DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [Notification, SmsLog],
  migrations: [],
};
