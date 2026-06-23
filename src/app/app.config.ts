import { ApplicationConfig, APP_INITIALIZER, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { StorageService } from './core/services/storage.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    // IndexedDB cache must be ready before all services are created
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const storage = inject(StorageService);
        return () => storage.whenReady();
      },
      multi: true,
    },
  ]
};
