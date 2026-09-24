export interface CardField {
  value: string;
  enabled: boolean;
}

export interface CardDraft {
  firstName: string;
  lastName: string;
  middleName: string;
  jobTitle: CardField;
  organization: CardField;
  description: CardField;
  mobile: CardField;
  workPhone: CardField;
  email: CardField;
  website: CardField;
  address: CardField;
  companyDescription: CardField;
  companyPhone: CardField;
  companyEmail: CardField;
  companyWebsite: CardField;
  companyAddress: CardField;

  photo: CardField;
  background: CardField;
  messengers: {
    telegram: CardField;
    whatsapp: CardField;
    max: CardField;
    express: CardField;
  };
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

export type TextFieldName =
  | 'jobTitle'
  | 'organization'
  | 'description'
  | 'mobile'
  | 'workPhone'
  | 'email'
  | 'website'
  | 'address'
  | 'companyDescription'
  | 'companyPhone'
  | 'companyEmail'
  | 'companyWebsite'
  | 'companyAddress'
  | 'photo'
  | 'background';

function emptyField(): CardField {
  return {
    value: '',
    enabled: true,
  };
}

export function createEmptyDraft(): CardDraft {
  return {
    firstName: '',
    lastName: '',
    middleName: '',
    jobTitle: emptyField(),
    organization: emptyField(),
    description: emptyField(),
    mobile: emptyField(),
    workPhone: emptyField(),
    email: emptyField(),
    website: emptyField(),
    address: emptyField(),
    companyDescription: emptyField(),
    companyPhone: emptyField(),
    companyEmail: emptyField(),
    companyWebsite: emptyField(),
    companyAddress: emptyField(),

    photo: emptyField(),
    background: emptyField(),
    messengers: {
      telegram: emptyField(),
      whatsapp: emptyField(),
      max: emptyField(),
      express: emptyField(),
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
}
