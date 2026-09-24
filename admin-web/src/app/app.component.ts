import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { ContactRound, LogOut, ShieldCheck, LucideAngularModule } from 'lucide-angular';
import { CardsComponent } from './cards/cards.component';
import { AuthService, SessionUser } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [LucideAngularModule, CardsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly cardsPanel = viewChild(CardsComponent);

  readonly hideWelcome = computed(() => {
    const cardsPanel = this.cardsPanel();

    if (!cardsPanel) {
      return false;
    }

    return cardsPanel.formOpen() || cardsPanel.previewActive();
  });

  readonly icons = {
    ContactRound,
    LogOut,
    ShieldCheck,
  };
  readonly user = signal<SessionUser | null>(null);
  readonly checkingSession = signal(true);
  readonly sessionError = signal(false);
  readonly busy = signal(false);
  readonly mode = signal<'login' | 'register'>('login');
  readonly errorMessage = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly passwordConfirmation = signal('');
  readonly isRegistration = computed(() => this.mode() === 'register');

  constructor() {
    this.checkSession();
  }

  checkSession(): void {
    this.checkingSession.set(true);
    this.sessionError.set(false);
    this.errorMessage.set('');

    // Cookie HttpOnly отправляется браузером. Сам токен Angular не читает и не хранит.
    this.auth.currentUser().pipe(
      finalize(() => this.checkingSession.set(false)),
    ).subscribe({
      next: user => this.user.set(user),
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.user.set(null);
          return;
        }

        this.sessionError.set(true);
        this.errorMessage.set('Не удалось связаться с сервером. Попробуйте ещё раз.');
      },
    });
  }

  changeMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.password.set('');
    this.passwordConfirmation.set('');
    this.errorMessage.set('');
  }

  submit(event: Event): void {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    this.errorMessage.set('');

    if (this.isRegistration() && this.password() !== this.passwordConfirmation()) {
      this.errorMessage.set('Пароли не совпадают.');
      return;
    }

    const credentials = {
      email: this.email(),
      password: this.password(),
    };
    let request = this.auth.login(credentials);

    if (this.isRegistration()) {
      request = this.auth.register(credentials);
    }

    this.busy.set(true);

    request.pipe(
      finalize(() => this.busy.set(false)),
    ).subscribe({
      next: user => {
        this.user.set(user);
        this.password.set('');
        this.passwordConfirmation.set('');
      },
      error: (error: HttpErrorResponse) => this.showRequestError(error),
    });
  }

  onSessionExpired(): void {
    this.user.set(null);
    this.changeMode('login');
    this.errorMessage.set('Сессия завершена. Войдите снова.');
  }

  logout(): void {
    this.busy.set(true);
    this.errorMessage.set('');

    this.auth.logout().pipe(
      finalize(() => this.busy.set(false)),
    ).subscribe({
      next: () => {
        this.user.set(null);
        this.changeMode('login');
      },
      error: (error: HttpErrorResponse) => this.showRequestError(error),
    });
  }

  private showRequestError(error: HttpErrorResponse): void {
    if (error.status === 0 || error.status >= 500) {
      this.errorMessage.set('Сервер временно недоступен. Попробуйте ещё раз.');
      return;
    }

    const message = error.error?.message;

    if (typeof message === 'string') {
      this.errorMessage.set(message);
      return;
    }

    this.errorMessage.set('Не удалось выполнить запрос. Попробуйте ещё раз.');
  }
}
