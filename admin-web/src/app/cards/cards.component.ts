import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ContactRound, Plus, Pencil, Trash2, QrCode, LucideAngularModule } from 'lucide-angular';
import { CardQrComponent } from './card-qr.component';
import { CardEditorComponent } from './card-editor.component';
import { CardsService, CardSummary, CardDetail } from './cards.service';

@Component({
  selector: 'app-cards',
  imports: [DatePipe, LucideAngularModule, CardEditorComponent, CardQrComponent],
  templateUrl: './cards.component.html',
  styleUrl: './cards.component.css',
})
export class CardsComponent {
  private readonly service = inject(CardsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly editor = viewChild(CardEditorComponent);

  // При закрытии редактора viewChild очистится, и шапка кабинета вернётся сама.
  readonly previewActive = computed(() => Boolean(this.editor()?.previewCard()));
  readonly sessionExpired = output<void>();
  readonly cards = signal<CardSummary[]>([]);
  readonly editingCard = signal<CardDetail | null>(null);
  readonly openingEditor = signal(false);
  readonly editorError = signal('');
  readonly deleteCandidate = signal<CardSummary | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly publicationCandidate = signal<CardSummary | null>(null);
  readonly publicationAction = signal<'publish' | 'unpublish'>('publish');
  readonly changingPublication = signal(false);
  readonly publicationError = signal('');
  readonly loading = signal(true);
  readonly formOpen = signal(false);
  readonly listError = signal('');
  readonly notice = signal('');
  readonly icons = {
    ContactRound,
    Plus,
    Pencil,
    Trash2,
    QrCode,
  };
  readonly statusLabels = {
    draft: 'Черновик',
    published: 'Опубликована',
  };

  constructor() {
    this.loadCards();
  }

  loadCards(): void {
    this.loading.set(true);
    this.listError.set('');

    this.service.list().pipe(
      // При выходе компонент уничтожается: старый ответ не должен вернуть чужой список.
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: cards => this.cards.set(cards),
      error: (error: HttpErrorResponse) => {
        if (this.handleExpiredSession(error)) {
          return;
        }

        this.listError.set('Не удалось загрузить визитки. Попробуйте ещё раз.');
      },
    });
  }

  openForm(): void {
    this.cancelDeletion();
    this.cancelPublication();
    this.notice.set('');
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  editCard(card: CardSummary): void {
    this.cancelDeletion();
    this.cancelPublication();
    this.openingEditor.set(true);
    this.editorError.set('');
    this.notice.set('');

    this.service.getDraft(card.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.openingEditor.set(false)),
    ).subscribe({
      next: detail => this.editingCard.set(detail),
      error: (error: HttpErrorResponse) => {
        if (this.handleExpiredSession(error)) {
          return;
        }

        this.editorError.set('Не удалось открыть черновик. Попробуйте ещё раз.');
      },
    });
  }

  onDraftSaved(card: CardSummary): void {
    this.cards.update(cards => {
      const otherCards = cards.filter(item => item.id !== card.id);
      return [card, ...otherCards];
    });
    this.editingCard.set(null);
    this.closeForm();
    this.notice.set('Изменения сохранены в черновике.');
  }

  onEditorSessionExpired(): void {
    this.cards.set([]);
    this.editingCard.set(null);
    this.sessionExpired.emit();
  }

  requestDeletion(card: CardSummary): void {
    if (card.status === 'published' || this.deleting()) {
      return;
    }

    this.cancelPublication();
    this.notice.set('');
    this.deleteError.set('');
    this.deleteCandidate.set(card);
  }

  cancelDeletion(): void {
    this.deleteCandidate.set(null);
    this.deleteError.set('');
  }

  confirmDeletion(): void {
    const card = this.deleteCandidate();

    if (!card || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');

    this.service.deleteDraft(card.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.deleting.set(false)),
    ).subscribe({
      next: () => {
        // Убираем запись только после подтверждения от сервера.
        this.cards.update(cards => cards.filter(item => item.id !== card.id));
        this.cancelDeletion();
        this.notice.set('Черновик удалён.');
      },
      error: (error: HttpErrorResponse) => {
        if (this.handleExpiredSession(error)) {
          return;
        }

        const message = error.error?.message;

        if (error.status >= 400 && error.status < 500 && typeof message === 'string') {
          this.deleteError.set(message);
          return;
        }

        this.deleteError.set('Не удалось подтвердить удаление. Обновите страницу, чтобы проверить список.');
      },
    });
  }

  requestPublication(card: CardSummary, action: 'publish' | 'unpublish'): void {
    if (this.changingPublication() || this.deleting()) {
      return;
    }

    this.cancelDeletion();
    this.notice.set('');
    this.publicationError.set('');
    this.publicationAction.set(action);
    this.publicationCandidate.set(card);
  }

  cancelPublication(): void {
    this.publicationCandidate.set(null);
    this.publicationError.set('');
  }

  confirmPublication(): void {
    const card = this.publicationCandidate();
    const action = this.publicationAction();

    if (!card || this.changingPublication()) {
      return;
    }

    let request = this.service.publish(card.id);

    if (action === 'unpublish') {
      request = this.service.unpublish(card.id);
    }

    this.changingPublication.set(true);
    this.publicationError.set('');

    request.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.changingPublication.set(false)),
    ).subscribe({
      next: updatedCard => {
        this.cards.update(cards => {
          const otherCards = cards.filter(item => item.id !== updatedCard.id);
          return [updatedCard, ...otherCards];
        });
        this.cancelPublication();

        if (action === 'unpublish') {
          this.notice.set('Визитка снята с публикации. Её можно опубликовать снова по той же ссылке.');
          return;
        }

        this.notice.set('Сохранённая версия опубликована. Визитка доступна по публичной ссылке.');
      },
      error: (error: HttpErrorResponse) => {
        if (this.handleExpiredSession(error)) {
          return;
        }

        const message = error.error?.message;

        if (error.status >= 400 && error.status < 500 && typeof message === 'string') {
          this.publicationError.set(message);
          return;
        }

        this.publicationError.set('Не удалось подтвердить результат. Обновите страницу, чтобы проверить статус.');
      },
    });
  }

  private handleExpiredSession(error: HttpErrorResponse): boolean {
    if (error.status !== 401) {
      return false;
    }

    this.cards.set([]);
    this.sessionExpired.emit();

    return true;
  }
}
