import { BadRequestException } from '@nestjs/common';

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Ожидаются данные визитки.');
  }

  return value as Record<string, unknown>;
}

export function checkAllowedKeys(data: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      throw new BadRequestException('Запрос содержит неподдерживаемые поля.');
    }
  }
}

export function getText(data: Record<string, unknown>, key: string, maxLength: number, required = false): string {
  const value = data[key];

  if (value === undefined && !required) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`Поле «${key}» должно быть строкой.`);
  }

  const text = value.trim();

  if (required && !text) {
    throw new BadRequestException('Заполните фамилию и имя.');
  }

  if (text.length > maxLength) {
    throw new BadRequestException(`Поле «${key}»: не более ${maxLength} символов.`);
  }

  return text;
}

function getBoolean(data: Record<string, unknown>, key: string): boolean {
  if (typeof data[key] !== 'boolean') {
    throw new BadRequestException('Переключатель должен иметь значение true или false.');
  }

  return data[key];
}

function checkWebUrl(value: string, label: string): void {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    const allowedProtocol = url.protocol === 'https:' || url.protocol === 'http:';

    if (allowedProtocol && !url.username && !url.password) {
      return;
    }
  } catch {
    // Ниже возвращаем понятную ошибку вместо технического сообщения URL parser.
  }

  throw new BadRequestException(`«${label}»: укажите полную HTTP/HTTPS ссылку без логина и пароля.`);
}

function checkImageUrl(value: string, label: string): void {
  if (/^\/assets\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|svg)$/i.test(value)) {
    return;
  }

  if (/^\/api\/public\/images\/[a-f0-9-]{36}\.png$/.test(value)) {
    return;
  }

  checkWebUrl(value, label);
}

function readField(
  raw: unknown,
  label: string,
  maxLength: number,
  checkValue?: (value: string, label: string) => void,
) {
  const field = requireObject(raw);
  checkAllowedKeys(field, ['value', 'enabled']);
  const value = getText(field, 'value', maxLength);
  const enabled = getBoolean(field, 'enabled');

  if (checkValue) {
    checkValue(value, label);
  }

  // Выключенное значение остаётся в личном черновике, чтобы его можно было включить снова.
  // Публичный преобразователь удаляет такие значения перед отправкой посетителю.
  return {
    value,
    enabled,
  };
}

function checkEmail(value: string): void {
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new BadRequestException('Укажите корректный email.');
  }
}

const editableKeys = [
  'firstName', 'lastName', 'middleName',
  'jobTitle', 'organization', 'description',
  'mobile', 'workPhone', 'email', 'website',
  'address', 'companyDescription', 'photo', 'background',
  'companyPhone', 'companyEmail', 'companyWebsite', 'companyAddress',
  'messengers', 'blocks',
];

export function readDraftInput(body: unknown) {
  const data = requireObject(body);
  checkAllowedKeys(data, editableKeys);
  const firstName = getText(data, 'firstName', 100, true);
  const lastName = getText(data, 'lastName', 100, true);
  const middleName = getText(data, 'middleName', 100);
  const messengers = requireObject(data.messengers);
  const blocks = requireObject(data.blocks);

  checkAllowedKeys(messengers, ['telegram', 'whatsapp', 'max', 'express']);
  checkAllowedKeys(blocks, [
    'header', 'avatar', 'saveContact', 'phones', 'messengers',
    'email', 'website', 'address', 'map', 'company',
  ]);

  return {
    firstName,
    lastName,
    middleName,
    jobTitle: readField(data.jobTitle, 'Должность', 200),
    organization: readField(data.organization, 'Организация', 200),
    description: readField(data.description, 'Описание', 2000),
    mobile: readField(data.mobile, 'Мобильный телефон', 50),
    workPhone: readField(data.workPhone, 'Рабочий телефон', 50),
    email: readField(data.email, 'Email', 254, checkEmail),
    website: readField(data.website, 'Сайт', 2048, checkWebUrl),
    address: readField(data.address, 'Адрес', 500),
    companyDescription: readField(data.companyDescription, 'О компании', 5000),
    companyPhone: readField(data.companyPhone, 'Телефон компании', 50),
    companyEmail: readField(data.companyEmail, 'Email компании', 254, checkEmail),
    companyWebsite: readField(data.companyWebsite, 'Сайт компании', 2048, checkWebUrl),
    companyAddress: readField(data.companyAddress, 'Адрес компании', 500),

    photo: readField(data.photo, 'Фотография', 2048, checkImageUrl),
    background: readField(data.background, 'Фоновое изображение', 2048, checkImageUrl),
    messengers: {
      telegram: readField(messengers.telegram, 'Telegram', 2048, checkWebUrl),
      whatsapp: readField(messengers.whatsapp, 'WhatsApp', 2048, checkWebUrl),
      max: readField(messengers.max, 'MAX', 2048, checkWebUrl),
      express: readField(messengers.express, 'eXpress', 2048, checkWebUrl),
    },
    blocks: {
      header: getBoolean(blocks, 'header'),
      avatar: getBoolean(blocks, 'avatar'),
      saveContact: getBoolean(blocks, 'saveContact'),
      phones: getBoolean(blocks, 'phones'),
      messengers: getBoolean(blocks, 'messengers'),
      email: getBoolean(blocks, 'email'),
      website: getBoolean(blocks, 'website'),
      address: getBoolean(blocks, 'address'),
      map: getBoolean(blocks, 'map'),
      company: getBoolean(blocks, 'company'),
    },
  };
}

export function toEditableDraft(raw: unknown) {
  const data = requireObject(raw);
  const editable: Record<string, unknown> = {};

  // Из БД тоже выдаём только поля редактора, без произвольных внутренних свойств.
  for (const key of editableKeys) {
    editable[key] = data[key];
  }

  return readDraftInput(editable);
}
