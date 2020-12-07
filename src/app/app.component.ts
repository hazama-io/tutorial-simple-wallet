import { Component } from '@angular/core';
import { LocaleService } from 'angular-l10n';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor( public locale: LocaleService ){
    this.locale.setDefaultLocale('en');
  }
}
