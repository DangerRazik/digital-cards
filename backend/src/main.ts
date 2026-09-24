import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL || !process.env.AUTH_DATABASE_URL || !process.env.ADMIN_ORIGIN) {
    throw new Error('Настройки базы или ADMIN_ORIGIN не заданы.');
  }

  if (!process.env.EDITOR_DATABASE_URL || !process.env.PUBLIC_CARD_ORIGIN) {
    throw new Error('EDITOR_DATABASE_URL и PUBLIC_CARD_ORIGIN должны быть заданы.');
  }

  const publicOrigin = new URL(process.env.PUBLIC_CARD_ORIGIN);

  if (publicOrigin.origin !== process.env.PUBLIC_CARD_ORIGIN || !['http:', 'https:'].includes(publicOrigin.protocol)) {
    throw new Error('PUBLIC_CARD_ORIGIN должен быть HTTP/HTTPS origin без пути.');
  }

  const adminOrigin = new URL(process.env.ADMIN_ORIGIN);

  if (adminOrigin.origin !== process.env.ADMIN_ORIGIN) {
    throw new Error('ADMIN_ORIGIN должен содержать только origin без пути.');
  }

  if (process.env.NODE_ENV === 'production' && (adminOrigin.protocol !== 'https:' || publicOrigin.protocol !== 'https:')) {
    throw new Error('В production кабинет и публичные визитки должны работать по HTTPS.');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';

  if (process.env.TRUST_LOCAL_PROXY === 'true' && host !== '127.0.0.1') {
    throw new Error('При TRUST_LOCAL_PROXY=true backend должен слушать только 127.0.0.1.');
  }

  await app.listen(port, host);
}

bootstrap().catch(() => {
  // Не выводим строку подключения с паролем в журнал.
  console.error('Backend не запущен. Проверьте .env, доступность базы и свободный порт.');
  process.exitCode = 1;
});
