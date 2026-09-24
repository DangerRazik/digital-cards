import type { PublicCard } from '../../../../public-web/src/app/card.model';
import { CardDraft } from './card-draft.model';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export interface CardSummary {
  id: string;
  slug: string;
  displayName: string;
  jobTitle: string;
  organization: string;
  status: 'draft' | 'published';
  hasUnpublishedChanges: boolean;
  publicUrl: string;
  updatedAt: string;
}

export interface CardDetail extends CardSummary {
  draft: CardDraft;
}

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly http = inject(HttpClient);

  uploadImage(file: Blob) {
    const form = new FormData();
    form.append('file', file, 'image.png');
    return this.http.post<{ url: string }>('/api/admin/images', form);
  }

  list() {
    return this.http.get<CardSummary[]>('/api/admin/cards');
  }

  createDraft(draft: CardDraft) {
    return this.http.post<CardSummary>('/api/admin/cards', { draft });
  }

  previewNew(draft: CardDraft) {
    return this.http.post<PublicCard>('/api/admin/cards/preview', draft);
  }

  getDraft(id: string) {
    return this.http.get<CardDetail>(`/api/admin/cards/${encodeURIComponent(id)}/draft`);
  }

  updateDraft(id: string, draft: CardDraft) {
    return this.http.put<CardDetail>(`/api/admin/cards/${encodeURIComponent(id)}/draft`, draft);
  }

  previewDraft(id: string, draft: CardDraft) {
    return this.http.post<PublicCard>(`/api/admin/cards/${encodeURIComponent(id)}/preview`, draft);
  }

  publish(id: string) {
    return this.http.post<CardSummary>(`/api/admin/cards/${encodeURIComponent(id)}/publish`, {});
  }

  unpublish(id: string) {
    return this.http.post<CardSummary>(`/api/admin/cards/${encodeURIComponent(id)}/unpublish`, {});
  }

  deleteDraft(id: string) {
    return this.http.delete<void>(`/api/admin/cards/${encodeURIComponent(id)}/draft`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
