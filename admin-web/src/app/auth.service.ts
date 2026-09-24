import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export interface SessionUser {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/admin/auth';

  currentUser() {
    return this.http.get<SessionUser>(`${this.baseUrl}/me`);
  }

  register(credentials: Credentials) {
    return this.http.post<SessionUser>(`${this.baseUrl}/register`, credentials);
  }

  login(credentials: Credentials) {
    return this.http.post<SessionUser>(`${this.baseUrl}/login`, credentials);
  }

  logout() {
    return this.http.post<void>(`${this.baseUrl}/logout`, {});
  }
}
