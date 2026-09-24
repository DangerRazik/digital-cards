type JsonObject = Record<string, unknown>;


/**
 * Проверяет, что значение является обычным объектом.
 * Если нет — возвращает пустой объект.
 */
function toObject(value: unknown): JsonObject {
  if (value === null) {
    return {};
  }

  if (typeof value !== 'object') {
    return {};
  }

  if (Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}


/**
 * Получает строку и удаляет пробелы по краям.
 */
function getText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}


/**
 * Разрешает только обычные HTTP/HTTPS ссылки
 * без логина и пароля внутри URL.
 */
function getSafeLink(value: string): string {
  try {
    const url = new URL(value);

    const isAllowedProtocol =
      url.protocol === 'http:' ||
      url.protocol === 'https:';

    const hasCredentials =
      Boolean(url.username) ||
      Boolean(url.password);

    if (!isAllowedProtocol || hasCredentials) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}


/**
 * Разрешает изображения из локальной папки assets
 * или безопасные внешние HTTP/HTTPS ссылки.
 */
function getSafeImage(value: string): string {
  const localImagePattern =
    /^\/assets\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|svg)$/i;

  if (localImagePattern.test(value)) {
    return value;
  }

  if (/^\/api\/public\/images\/[a-f0-9-]{36}\.png$/.test(value)) {
    return value;
  }

  return getSafeLink(value);
}


/**
 * Создаёт поле, которое можно безопасно отправить
 * в публичную часть приложения.
 */
function createPublicField(
  rawField: unknown,
  isBlockEnabled = true,
  transform: (value: string) => string = value => value
) {
  const field = toObject(rawField);

  // Если весь блок выключен — значение наружу не отдаём.
  if (!isBlockEnabled) {
    return {
      value: '',
      enabled: false
    };
  }

  // Если конкретное поле выключено — его значение тоже не отдаём.
  if (field['enabled'] !== true) {
    return {
      value: '',
      enabled: false
    };
  }

  const originalValue = getText(field['value']);
  const publicValue = transform(originalValue);

  return {
    value: publicValue,
    enabled: publicValue.length > 0
  };
}


// Белый список ответа:
// не возвращаем JSON из БД напрямую.
//
// Если поле или блок выключены, их значения удаляются на сервере
export function toPublicCard(
  slug: string,
  snapshot: unknown
) {
  const data = toObject(snapshot);
  const blockFlags = toObject(data['blocks']);


  // Определяем, какие блоки разрешено показывать.
  const blocks = {
    header: blockFlags['header'] === true,
    avatar: blockFlags['avatar'] === true,
    saveContact: blockFlags['saveContact'] === true,
    phones: blockFlags['phones'] === true,
    messengers: blockFlags['messengers'] === true,
    email: blockFlags['email'] === true,
    website: blockFlags['website'] === true,
    address: blockFlags['address'] === true,
    map: blockFlags['map'] === true,
    company: blockFlags['company'] === true
  };

  // Карта компании не зависит от включения личного адреса.
  const companyAddress = createPublicField(data['companyAddress'], blocks.company);
  blocks.map = blocks.map && (blocks.address || companyAddress.enabled);


  const messengers = toObject(data['messengers']);


  return {
    slug,

    // Основная информация
    firstName: getText(data['firstName']),
    lastName: getText(data['lastName']),
    middleName: getText(data['middleName']),
    displayName: [getText(data['lastName']), getText(data['firstName']), getText(data['middleName'])]
      .filter(Boolean)
      .join(' '),

    jobTitle: createPublicField(
      data['jobTitle']
    ),

    organization: createPublicField(
      data['organization']
    ),

    description: createPublicField(
      data['description']
    ),


    // Телефоны
    mobile: createPublicField(
      data['mobile'],
      blocks.phones
    ),

    workPhone: createPublicField(
      data['workPhone'],
      blocks.phones
    ),


    // Контакты
    email: createPublicField(
      data['email'],
      blocks.email
    ),

    website: createPublicField(
      data['website'],
      blocks.website,
      getSafeLink
    ),


    // Адрес
    address: createPublicField(
      data['address'],
      blocks.address
    ),


    // Информация об организации
    companyDescription: createPublicField(
      data['companyDescription'],
      blocks.company
    ),


    companyPhone: createPublicField(data['companyPhone'], blocks.company),
    companyEmail: createPublicField(data['companyEmail'], blocks.company),
    companyWebsite: createPublicField(data['companyWebsite'], blocks.company, getSafeLink),
    companyAddress: createPublicField(data['companyAddress'], blocks.company),

    // Изображения
    photo: createPublicField(
      data['photo'],
      blocks.avatar,
      getSafeImage
    ),

    background: createPublicField(
      data['background'],
      blocks.header,
      getSafeImage
    ),


    // Мессенджеры
    messengers: {
      telegram: createPublicField(
        messengers['telegram'],
        blocks.messengers,
        getSafeLink
      ),

      whatsapp: createPublicField(
        messengers['whatsapp'],
        blocks.messengers,
        getSafeLink
      ),

      max: createPublicField(
        messengers['max'],
        blocks.messengers,
        getSafeLink
      ),

      express: createPublicField(
        messengers['express'],
        blocks.messengers,
        getSafeLink
      )
    },

    blocks
  };
}