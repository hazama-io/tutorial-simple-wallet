import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, APP_INITIALIZER } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { L10nConfig, L10nLoader, LocalizationModule, StorageStrategy, ProviderType } from 'angular-l10n';
import { MainComponent } from './views/main/main.component';

const l10nConfig: L10nConfig = {
    locale: {
      languages: [
          { code: 'en', dir: 'ltr' },
          { code: 'ja', dir: 'ltr' }
      ],
      defaultLocale: { languageCode: 'ja', countryCode: 'JP' },
      timezone: 'Japan/Tokyo',
      storage: StorageStrategy.Cookie
    },
    translation: {
      providers: [
          { type: ProviderType.Static, prefix: './assets/i18n/' }
      ],
      caching: true,
      missingValue: 'No key'
    }
};

export function initL10n(l10nLoader: L10nLoader): Function {
    return () => l10nLoader.load();
}

@NgModule({
  declarations: [
    AppComponent,
    MainComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    LocalizationModule.forRoot(l10nConfig)
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initL10n,
      deps: [L10nLoader],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
