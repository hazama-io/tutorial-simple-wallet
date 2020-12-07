import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor() {}

  get( key: string, def: any ): any {
    let data_str = localStorage.getItem( key );
    if( data_str === null || data_str === "undefined" ){
      return def;
    }

    let data = JSON.parse(data_str);
    if( data.expire != null ) {
      if( new Date(data.expire) <= new Date() ) {
        localStorage.removeItem(key);
        return def;
      }
    }
    return data.value;
  }

  set( key: string, value: any, ...args ): Boolean {
    let expire = null;
    if( args && typeof args[0] === 'number' ) {
      expire = new Date(new Date().getTime() + (args[0] * 1000)).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    }

    let data = {
      value: value,
      expire: expire
    };
    localStorage.setItem(key, JSON.stringify(data));

    return true;
  }

  remove( key: string ): Boolean {
    localStorage.removeItem( key );
    return true;
  }
}
