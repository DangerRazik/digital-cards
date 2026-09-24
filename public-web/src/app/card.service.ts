import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PublicCard } from './card.model';

@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly http = inject(HttpClient);

  getPublishedCard(slug: string): Observable<PublicCard> {
    const encodedSlug = encodeURIComponent(slug);
    const url = `/api/public/cards/${encodedSlug}`;

    return this.http.get<PublicCard>(url);
  }
}
