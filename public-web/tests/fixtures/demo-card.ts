import { PublicCard } from '../../src/app/card.model';

// Пример только для тестов экспорта. Публичная страница получает данные из API.
// Телефоны и email тестовые; ссылки мессенджеров открывают сайты сервисов.
export const DEMO_CARD: PublicCard = {
  slug: 'test-person',
  lastName: 'Тестов',
  firstName: 'Иван',
  middleName: '',
  displayName: 'Тестов Иван',
  jobTitle: {
    value: 'Руководитель службы информационных технологий',
    enabled: true,
  },
  organization: {
    value: 'Тестовая организация',
    enabled: true,
  },
  description: {
    value: '',
    enabled: false,
  },
  mobile: {
    value: '+7 (900) 000-00-00',
    enabled: true,
  },
  workPhone: {
    value: '+7 (495) 000-00-00',
    enabled: true,
  },
  email: {
    value: 'name@example.ru',
    enabled: true,
  },
  website: {
    value: 'https://example.com',
    enabled: true,
  },
  messengers: {
    telegram: {
      value: 'https://telegram.org',
      enabled: true,
    },
    whatsapp: {
      value: 'https://www.whatsapp.com',
      enabled: true,
    },
    max: {
      value: 'https://max.ru',
      enabled: true,
    },
    express: {
      value: 'https://express.ms',
      enabled: true,
    },
  },
  address: {
    value: 'Москва, Ленинградский проспект, 37к7',
    enabled: true,
  },
  companyDescription: {
    value: 'Тестовая организация обеспечивает управление воздушным движением на территории Российской Федерации.',
    enabled: true,
  },
  companyPhone: {
    value: '',
    enabled: false,
  },
  companyEmail: {
    value: '',
    enabled: false,
  },
  companyWebsite: {
    value: '',
    enabled: false,
  },
  companyAddress: {
    value: '',
    enabled: false,
  },
  photo: {
    value: '',
    enabled: false,
  },
  background: {
    value: '',
    enabled: false,
  },
  blocks: {
    header: true,
    avatar: true,
    saveContact: true,
    phones: true,
    messengers: true,
    email: true,
    website: true,
    address: true,
    map: true,
    company: true,
  },
};
