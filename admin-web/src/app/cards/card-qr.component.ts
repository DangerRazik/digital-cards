import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Copy, Download, X, LucideAngularModule } from 'lucide-angular';
import type { CardSummary } from './cards.service';
import { createCardQr } from './qr-code';

@Component({
  selector: 'app-card-qr',
  imports: [LucideAngularModule],
  templateUrl: './card-qr.component.html',
  styleUrls: ['./cards.component.css', './card-qr.component.css'],
})
export class CardQrComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;

  readonly card = signal<CardSummary | null>(null);
  readonly image = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly icons = { Copy, Download, X };

  async open(card: CardSummary): Promise<void> {
    if (card.status !== 'published') {
      return;
    }
    const generation = ++this.generation;
    this.card.set(card);
    this.image.set('');
    this.error.set('');
    this.message.set('');
    this.loading.set(true);
    this.dialog().nativeElement.showModal();

    try {
      const image = await createCardQr(card.publicUrl);
      // Ответ закрытого окна не должен подменить QR другой визитки.
      if (generation === this.generation && !this.destroyRef.destroyed) {
        this.image.set(image);
      }
    } catch {
      if (generation === this.generation && !this.destroyRef.destroyed) {
        this.error.set('Не удалось создать QR-код. Закройте окно и попробуйте снова.');
      }
    } finally {
      if (generation === this.generation && !this.destroyRef.destroyed) {
        this.loading.set(false);
      }
    }
  }

  close(): void {
    this.dialog().nativeElement.close();
    this.onClosed();
  }

  onClosed(): void {
    // Событие close может прийти уже после повторного открытия окна.
    if (this.dialog().nativeElement.open) {
      return;
    }

    this.generation += 1;
    this.card.set(null);
    this.image.set('');
    this.message.set('');
  }

  download(): void {
    const card = this.card();
    const image = this.image();
    if (!card || !image) {
      return;
    }
    const link = document.createElement('a');
    link.href = image;
    link.download = `${card.slug.replace(/[^a-z0-9-]/gi, '') || 'card'}-qr.png`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  async copyLink(input: HTMLInputElement): Promise<void> {
    const card = this.card();
    if (!card) {
      return;
    }
    const generation = this.generation;
    try {
      await navigator.clipboard.writeText(card.publicUrl);
      if (generation === this.generation && !this.destroyRef.destroyed) {
        this.message.set('Ссылка скопирована.');
      }
    } catch {
      if (generation === this.generation && !this.destroyRef.destroyed) {
        input.focus();
        input.select();
        this.message.set('Не удалось скопировать автоматически. Ссылка выделена — скопируйте её вручную.');
      }
    }
  }
}
