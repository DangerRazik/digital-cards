// Публичная модель не содержит паролей, черновиков и административных метаданных.
export interface CardField {
  value: string;
  enabled: boolean;
}

export type MessengerName = 'telegram' | 'whatsapp' | 'max' | 'express';

export interface PublicCard {
  slug: string;
  lastName: string;
  firstName: string;
  middleName: string;
  displayName: string;
  jobTitle: CardField;
  organization: CardField;
  description: CardField;
  mobile: CardField;
  workPhone: CardField;
  email: CardField;
  website: CardField;
  messengers: Record<MessengerName, CardField>;
  address: CardField;
  companyDescription: CardField;
  companyPhone: CardField;
  companyEmail: CardField;
  companyWebsite: CardField;
  companyAddress: CardField;

  photo: CardField;
  background: CardField;
  blocks: {
    header: boolean;
    avatar: boolean;
    saveContact: boolean;
    phones: boolean;
    messengers: boolean;
    email: boolean;
    website: boolean;
    address: boolean;
    map: boolean;
    company: boolean;
  };
}

export function visible(field: CardField): boolean {
  return field.enabled && field.value.trim().length > 0;
}

// Ссылки из API не должны исполнять javascript: или открывать data: URL.
export function webUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (!['https:', 'http:'].includes(url.protocol)) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export function phoneHref(value: string): string {
  const phoneNumber = value.replace(/[^\d+]/g, '');

  return `tel:${phoneNumber}`;
}
