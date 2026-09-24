import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from './password';
import { sessionLifetimeSeconds } from './session-cookie';
import type { SessionUser } from './auth.types';

interface UserRow extends SessionUser {
  password_hash: string;
}

function readCredentials(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Укажите email и пароль.');
  }

  const fields = body as Record<string, unknown>;

  if (typeof fields.email !== 'string' || typeof fields.password !== 'string') {
    throw new BadRequestException('Укажите email и пароль.');
  }

  const email = fields.email.trim().toLowerCase();
  const password = fields.password;

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Укажите корректный email.');
  }

  // Пароль не обрезаем: пробелы могут быть частью выбранного пользователем пароля.
  if (password.length < 8 || password.length > 128) {
    throw new BadRequestException('Пароль должен содержать от 8 до 128 символов.');
  }

  return {
    email,
    password,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.AUTH_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'digital-cards-auth',
  });
  private passwordOperations = 0;

  constructor() {
    this.pool.on('error', () => {
      console.error('Соединение с базой авторизации прервано.');
    });
  }

  private async runPasswordOperation<T>(operation: () => Promise<T>): Promise<T> {
    // Ограничиваем расход памяти scrypt при одновременных запросах.
    if (this.passwordOperations >= 2) {
      throw new ServiceUnavailableException('Сервер занят. Попробуйте через несколько секунд.');
    }

    this.passwordOperations += 1;

    try {
      return await operation();
    } finally {
      this.passwordOperations -= 1;
    }
  }

  async register(body: unknown) {
    const credentials = readCredentials(body);
    const passwordHash = await this.runPasswordOperation(() => hashPassword(credentials.password));
    const token = randomBytes(32).toString('hex');
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<SessionUser>(
        'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [credentials.email, passwordHash],
      );
      const user = result.rows[0];

      await client.query(
        'INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(token), user.id, new Date(Date.now() + sessionLifetimeSeconds * 1000)],
      );
      await client.query('COMMIT');

      return {
        user,
        token,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Не удалось зарегистрироваться с этим email. Попробуйте войти.');
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async login(body: unknown, previousToken: string | null) {
    const credentials = readCredentials(body);
    const result = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [credentials.email],
    );
    const user = result.rows[0];

    // Для неизвестного email тоже выполняем scrypt, чтобы не было быстрого ответа.
    const fallbackHash = `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const passwordHash = user?.password_hash ?? fallbackHash;
    const matches = await this.runPasswordOperation(() => verifyPassword(credentials.password, passwordHash));

    if (!user || !matches) {
      throw new UnauthorizedException('Неверный email или пароль.');
    }

    const token = randomBytes(32).toString('hex');

    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.pool.query(
      'INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [hashToken(token), user.id, new Date(Date.now() + sessionLifetimeSeconds * 1000)],
    );
    await this.logout(previousToken);

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      token,
    };
  }

  async findSessionUser(token: string | null): Promise<SessionUser> {
    if (!token) {
      throw new UnauthorizedException('Войдите в личный кабинет.');
    }

    const result = await this.pool.query<SessionUser>(
      `SELECT users.id, users.email
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [hashToken(token)],
    );
    const user = result.rows[0];

    if (!user) {
      throw new UnauthorizedException('Сессия завершена. Войдите снова.');
    }

    return user;
  }

  async logout(token: string | null): Promise<void> {
    if (token) {
      await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
