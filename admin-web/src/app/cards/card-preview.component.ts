import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  Building2,
  ChevronRight,
  ContactRound,
  ExternalLink,
  Globe,
  LucideAngularModule,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Smartphone,
} from 'lucide-angular';
import { MessengerName, PublicCard, phoneHref, visible, webUrl } from '../../../../public-web/src/app/card.model';
import { createYandexMapEmbedUrl, createYandexMapsUrl } from '../../../../public-web/src/app/map-url.utils';
import { privateImageUrl } from './image-upload.utils';
import { downloadVCard } from '../../../../public-web/src/app/vcard';

@Component({
  selector: 'app-card-preview',
  imports: [LucideAngularModule],
  templateUrl: '../../../../public-web/src/app/card-page.component.html',
  styleUrls: [
    '../../../../public-web/src/app/card-page.component.css',
    './card-preview.component.css',
  ],
})
export class CardPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly sourceCard = input.required<PublicCard>({ alias: 'card' });
  readonly card = computed(() => {
    const card = this.sourceCard();
    return {
      ...card,
      photo: {
        ...card.photo,
        value: privateImageUrl(card.photo.value),
      },
      background: {
        ...card.background,
        value: privateImageUrl(card.background.value),
      },
    };
  });
  // Общий шаблон содержит состояния загрузки публичной страницы. Здесь данные уже получены.
  readonly request = computed(() => ({ status: 'ready' }));

  readonly icons = {
    ContactRound,
    Smartphone,
    Phone,
    Mail,
    Globe,
    MapPin,
    ChevronRight,
    Building2,
    MessageCircle,
    ExternalLink,
  };

  readonly visible = visible;
  readonly phoneHref = phoneHref;
  readonly webUrl = webUrl;
  readonly imageFailed = signal(false);
  readonly coverFailed = signal(false);
  readonly saveMessage = signal('');

  readonly messengerNames: {
    key: MessengerName;
    label: string;
  }[] = [
    {
      key: 'telegram',
      label: 'Telegram',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
    },
    {
      key: 'max',
      label: 'MAX',
    },
    {
      key: 'express',
      label: 'eXpress',
    },
  ];

  readonly messengers = computed(() => {
    const card = this.card();

    if (!card?.blocks.messengers) {
      return [];
    }

    const links: {
      key: MessengerName;
      label: string;
      url: string;
    }[] = [];

    for (const messenger of this.messengerNames) {
      const field = card.messengers[messenger.key];

      if (!visible(field)) {
        continue;
      }

      const url = webUrl(field.value);

      if (!url) {
        continue;
      }

      links.push({
        ...messenger,
        url,
      });
    }

    return links;
  });

  readonly avatar = computed(() => {
    const card = this.card();

    if (!card) {
      return '';
    }

    if (visible(card.photo)) {
      return card.photo.value;
    }

    return '';
  });

  readonly initials = computed(() => {
    const card = this.card();

    if (!card) {
      return '';
    }

    const firstInitial = card.firstName[0] || '';
    const lastInitial = card.lastName[0] || '';

    return `${firstInitial}${lastInitial}`;
  });

  readonly website = computed(() => {
    const field = this.card()?.website;

    if (!field || !visible(field)) {
      return null;
    }

    return webUrl(field.value);
  });

  readonly websiteLabel = computed(() => {
    const website = this.website();

    if (!website) {
      return '';
    }

    return new URL(website).hostname;
  });

  readonly companyMapLink = computed(() => {
    return createYandexMapsUrl(this.card()?.companyAddress.value ?? '');
  });

  readonly companyMapEmbed = computed(() => {
    const address = this.card()?.companyAddress.value ?? '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(createYandexMapEmbedUrl(address));
  });

  readonly companyVisible = computed(() => {
    const card = this.card();
    if (!card?.blocks.company) {
      return false;
    }
    return [card.companyDescription, card.companyPhone, card.companyEmail, card.companyWebsite, card.companyAddress].some(visible);
  });

  readonly mapLink = computed(() => {
    const address = this.card()?.address.value ?? '';

    return createYandexMapsUrl(address);
  });

  readonly mapEmbed = computed(() => {
    const address = this.card()?.address.value ?? '';
    const url = createYandexMapEmbedUrl(address);

    // Разрешаем iframe только с URL нашего фиксированного провайдера, не со ссылкой из API.
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    effect(() => {
      // Ошибки изображений и сообщение о сохранении относятся к конкретной визитке.
      this.card();
      this.imageFailed.set(false);
      this.coverFailed.set(false);
      this.saveMessage.set('');
    });
  }

  reload(): void {
    window.location.reload();
  }

  emailHref(email: string): string {
    return `mailto:${encodeURIComponent(email.trim())}`;
  }

  saveContact(): void {
    const card = this.card();

    if (!card) {
      return;
    }

    try {
      downloadVCard(card);
      this.saveMessage.set('Файл контакта подготовлен. Откройте его, чтобы добавить контакт.');
    } catch {
      this.saveMessage.set('Не удалось подготовить контакт. Попробуйте ещё раз.');
    }
  }
}
