import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateSiteOrigins } from './site-origins';

async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL || !process.env.AUTH_DATABASE_URL || !process.env.ADMIN_ORIGIN) {
    throw new Error('Настройки базы или ADMIN_ORIGIN не заданы.');
  }

  if (!process.env.EDITOR_DATABASE_URL || !process.env.PUBLIC_CARD_ORIGIN) {
    throw new Error('EDITOR_DATABASE_URL и PUBLIC_CARD_ORIGIN должны быть заданы.');
  }

  validateSiteOrigins(process.env);

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
