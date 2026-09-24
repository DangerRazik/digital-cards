import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouterOutlet } from '@angular/router';
import { CardPageComponent } from './app/card-page.component';
import { provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class AppComponent {}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter([
      {
        path: '',
        pathMatch: 'full',
        component: CardPageComponent,
      },
      {
        path: ':slug',
        component: CardPageComponent,
      },
      {
        path: '**',
        component: CardPageComponent,
      },
    ]),
  ],
}).catch(error => {
  console.error(error);
});
