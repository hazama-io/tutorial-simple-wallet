import { Component, OnInit } from '@angular/core';
import { TranslationService } from 'angular-l10n';
import { WalletService } from '../../core';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit {
  public title: string = 'Simple Wallet Tutorial';

  constructor( private wallet: WalletService, public t: TranslationService ) { }

  ngOnInit() {

  }

}
