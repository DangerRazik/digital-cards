import type { PublicCard } from '../../../../public-web/src/app/card.model';
import { CardPreviewComponent } from './card-preview.component';
import { ImagePlus, Upload, Trash2, LucideAngularModule } from 'lucide-angular';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, firstValueFrom } from 'rxjs';
import { prepareImage, privateImageUrl } from './image-upload.utils';
import { CardDetail, CardSummary, CardsService } from './cards.service';
import { CardDraft, TextFieldName, createEmptyDraft } from './card-draft.model';

type ImageFieldName = 'photo' | 'background';

interface FieldDefinition {
  key: TextFieldName;
  label: string;
  maxLength: number;
  multiline?: boolean;
  hint?: string;
  type?: 'text' | 'email' | 'tel';
}

interface FieldGroup {
  title: string;
  hint?: string;
  fields: FieldDefinition[];
}

function getFormText(form: FormData, name: string): string {
  const value = form.get(name);

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function readField(form: FormData, name: string) {
  return {
    value: getFormText(form, name),
    enabled: form.has(`${name}.enabled`),
  };
}

@Component({
  selector: 'app-card-editor',
  imports: [CardPreviewComponent, LucideAngularModule],
  templateUrl: './card-editor.component.html',
  styleUrls: ['./cards.component.css', './card-editor.component.css'],
})
export class CardEditorComponent {
  private readonly service = inject(CardsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly card = input<CardDetail | null>(null);
  readonly emptyDraft = createEmptyDraft();
  readonly saved = output<CardSummary>();
  readonly cancelled = output<void>();
  readonly sessionExpired = output<void>();
  readonly previewCard = signal<PublicCard | null>(null);
  readonly previewing = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly uploading = signal(false);
  readonly imagePaths = signal<Partial<Record<ImageFieldName, string>>>({});
  readonly imageError = signal('');
  readonly imageIcons = { ImagePlus, Upload, Trash2 };
  readonly imageFields: { key: ImageFieldName; label: string }[] = [
    {
      key: 'photo',
      label: 'Фотография',
    },
    {
      key: 'background',
      label: 'Обложка',
    },
  ];

  readonly groups: FieldGroup[] = [
    {
      title: 'Работа и описание',
      fields: [
        {
          key: 'jobTitle',
          label: 'Должность',
          maxLength: 200,
        },
        {
          key: 'organization',
          label: 'Организация',
          maxLength: 200,
        },
        {
          key: 'description',
          label: 'Описание',
          maxLength: 2000,
          multiline: true,
        },
      ],
    },
    {
      title: 'Контакты',
      hint: 'Для сайта укажите полную ссылку, начиная с https://.',
      fields: [
        {
          key: 'mobile',
          label: 'Мобильный телефон',
          maxLength: 50,
          type: 'tel',
        },
        {
          key: 'workPhone',
          label: 'Рабочий телефон',
          maxLength: 50,
          type: 'tel',
        },
        {
          key: 'email',
          label: 'Email',
          maxLength: 254,
          type: 'email',
        },
        {
          key: 'website',
          label: 'Сайт',
          maxLength: 2048,
        },
        {
          key: 'address',
          label: 'Адрес',
          maxLength: 500,
        },

      ],
    },
    {
      title: 'О компании',
      hint: 'Название берётся из поля «Организация». Здесь укажите контакты компании отдельно от личных.',
      fields: [
        {
          key: 'companyDescription',
          label: 'Описание компании',
          maxLength: 5000,
          multiline: true,
        },
        {
          key: 'companyPhone',
          label: 'Телефон компании',
          maxLength: 50,
          type: 'tel',
        },
        {
          key: 'companyEmail',
          label: 'Email компании',
          maxLength: 254,
          type: 'email',
        },
        {
          key: 'companyWebsite',
          label: 'Сайт компании',
          maxLength: 2048,
          type: 'text',
        },
        {
          key: 'companyAddress',
          label: 'Адрес компании',
          maxLength: 500,
          type: 'text',
        },
      ],
    },

  ];

  readonly messengerFields: {
    key: keyof CardDraft['messengers'];
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

  readonly blockFields: {
    key: keyof CardDraft['blocks'];
    label: string;
  }[] = [
    {
      key: 'header',
      label: 'Показывать обложку',
    },
    {
      key: 'avatar',
      label: 'Показывать аватар',
    },
    {
      key: 'saveContact',
      label: 'Кнопка «Сохранить контакт»',
    },
    {
      key: 'map',
      label: 'Карта под адресом',
    },
  ];

  getDraft(): CardDraft {
    return this.card()?.draft ?? this.emptyDraft;
  }

  isFieldEnabled(key: TextFieldName): boolean {
    const draft = this.getDraft();
    let blockEnabled = true;

    // Переносим старые групповые выключатели в отдельные поля,
    // чтобы скрытые ранее контакты не включились при сохранении новой формы.
    if (key === 'mobile' || key === 'workPhone') {
      blockEnabled = draft.blocks.phones;
    } else if (key === 'email' || key === 'website' || key === 'address') {
      blockEnabled = draft.blocks[key];
    } else if (key === 'companyDescription' || key === 'companyPhone' || key === 'companyEmail' || key === 'companyWebsite' || key === 'companyAddress') {
      blockEnabled = draft.blocks.company;
    }

    return draft[key].enabled && blockEnabled;
  }

  save(event: Event, formElement: HTMLFormElement): void {
    event.preventDefault();

    if (this.saving() || this.previewing() || this.uploading()) {
      return;
    }

    const form = new FormData(formElement);
    const draft = this.readDraft(form);
    this.saving.set(true);
    this.errorMessage.set('');

    const card = this.card();
    let request = this.service.createDraft(draft);

    if (card) {
      request = this.service.updateDraft(card.id, draft);
    }

    request.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: card => this.saved.emit(card),
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.sessionExpired.emit();
          return;
        }

        const message = error.error?.message;

        if (error.status >= 400 && error.status < 500 && typeof message === 'string') {
          this.errorMessage.set(message);
          return;
        }

        // Форму не очищаем: после сетевой ошибки пользователь может повторить сохранение.
        this.errorMessage.set('Не удалось подтвердить сохранение. Данные формы сохранены на экране — попробуйте ещё раз.');
      },
    });
  }

  preview(formElement: HTMLFormElement): void {
    if (this.saving() || this.previewing() || this.uploading() || !formElement.reportValidity()) {
      return;
    }

    const draft = this.readDraft(new FormData(formElement));
    this.errorMessage.set('');
    this.previewing.set(true);

    const card = this.card();
    let request = this.service.previewNew(draft);

    if (card) {
      request = this.service.previewDraft(card.id, draft);
    }

    request.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.previewing.set(false)),
    ).subscribe({
      next: card => this.previewCard.set(card),
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.sessionExpired.emit();
          return;
        }

        const message = error.error?.message;

        if (error.status >= 400 && error.status < 500 && typeof message === 'string') {
          this.errorMessage.set(message);
          return;
        }

        this.errorMessage.set('Не удалось открыть предпросмотр. Попробуйте ещё раз.');
      },
    });
  }

  imageValue(key: ImageFieldName): string {
    return this.imagePaths()[key] ?? this.getDraft()[key].value;
  }

  imagePreview(key: ImageFieldName): string {
    return privateImageUrl(this.imageValue(key));
  }

  setImage(key: ImageFieldName, value: string): void {
    this.imagePaths.update(paths => ({ ...paths, [key]: value }));
  }

  async uploadImage(key: ImageFieldName, picker: HTMLInputElement, form: HTMLFormElement): Promise<void> {
    const file = picker.files?.[0];
    if (!file || this.uploading()) {
      return;
    }

    this.uploading.set(true);
    this.imageError.set('');
    try {
      const image = await prepareImage(file);
      if (this.destroyRef.destroyed) {
        return;
      }
      const result = await firstValueFrom(
        this.service.uploadImage(image).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      this.setImage(key, result.url);
      const toggle = form.elements.namedItem(`${key}.enabled`);
      if (toggle instanceof HTMLInputElement) {
        toggle.checked = true;
      }
    } catch (error) {
      if (this.destroyRef.destroyed) {
        return;
      }
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          this.sessionExpired.emit();
          return;
        }
        this.imageError.set('Не удалось загрузить изображение. Попробуйте ещё раз.');
      } else if (error instanceof Error) {
        this.imageError.set(error.message);
      }
    } finally {
      this.uploading.set(false);
      picker.value = '';
    }
  }

  private readDraft(form: FormData): CardDraft {
    return {
      firstName: getFormText(form, 'firstName'),
      lastName: getFormText(form, 'lastName'),
      middleName: getFormText(form, 'middleName'),
      jobTitle: readField(form, 'jobTitle'),
      organization: readField(form, 'organization'),
      description: readField(form, 'description'),
      mobile: readField(form, 'mobile'),
      workPhone: readField(form, 'workPhone'),
      email: readField(form, 'email'),
      website: readField(form, 'website'),
      address: readField(form, 'address'),
      companyDescription: readField(form, 'companyDescription'),
      companyPhone: readField(form, 'companyPhone'),
      companyEmail: readField(form, 'companyEmail'),
      companyWebsite: readField(form, 'companyWebsite'),
      companyAddress: readField(form, 'companyAddress'),

      photo: {
        value: this.imageValue('photo'),
        enabled: form.has('photo.enabled'),
      },
      background: {
        value: this.imageValue('background'),
        enabled: form.has('background.enabled'),
      },
      messengers: {
        telegram: readField(form, 'messengers.telegram'),
        whatsapp: readField(form, 'messengers.whatsapp'),
        max: readField(form, 'messengers.max'),
        express: readField(form, 'messengers.express'),
      },
      blocks: {
        header: form.has('blocks.header'),
        avatar: form.has('blocks.avatar'),
        saveContact: form.has('blocks.saveContact'),
        phones: true,
        messengers: true,
        email: true,
        website: true,
        address: true,
        map: form.has('blocks.map'),
        company: form.has('companyDescription.enabled')
          || form.has('companyPhone.enabled')
          || form.has('companyEmail.enabled')
          || form.has('companyWebsite.enabled')
          || form.has('companyAddress.enabled'),
      },
    };
  }
}
