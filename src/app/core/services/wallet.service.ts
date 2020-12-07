import { Injectable } from '@angular/core';

import { StorageService } from './storage.service';

import ztak from 'ztakio-core'
import * as bitcoin from 'bitcoinjs-lib'
import * as bip32 from 'bip32'
import * as bip39 from 'bip39'
import * as CryptoJS from 'crypto-js'
import BigNumber from 'bignumber.js'

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  public static token = '/hazama/myfirsttoken';

  private currentSeed: string;
  private coinParams = {
    'Hazama': {network: {
      pubKeyHash: 0x64,
      scriptHash: 0x28,
      messagePrefix: null,
      bech32: null,
      bip32: null,
      wif: null
    }, number: 81}
  }
  private networks = {
    'haz': {
      symbol: 'Haz',
      network: 'hazama',
      networkForCounterparty: 'hazama',
      name: 'Hazama',
      validBase58VersionBytes: [100],
      validBech32Prefix: 'haz'
    }
  }

  constructor(
    private storage: StorageService
  ) {
    this.currentSeed = '';
  }

  defaultPath( coin: any, account: number ) {
    return `m/49'/${coin}'/0'/0/${account}`;
  }

  newMnemonic() {
    let seed = bip39.generateMnemonic()

    let encrypted = CryptoJS.AES.encrypt(seed, 'testpass').toString() // for production, you MUST change this 'testpass' to more secure way. e.g. password entered by the user, etc.
    this.storage.set('s', encrypted)

    this.currentSeed = seed;
    return this.isCorrectPassphrase(seed)? seed: null;
  }

  getSeed() {
    let encrypted = this.storage.get('s', null)

    let seed = null;
    try {
      let decrypted = CryptoJS.AES.decrypt(encrypted, 'testpass') // for production, you MUST change this 'testpass' to more secure way. e.g. password entered by the user, etc.
      seed = decrypted.toString(CryptoJS.enc.Utf8)

      if( seed == null || seed.length <= 0 ) {
        return null;
      }
    }
    catch(e){
      return this.newMnemonic();
    }
    this.currentSeed = this.isCorrectPassphrase(seed)? seed: null;;
    return this.currentSeed;
  }

  isCorrectPassphrase( passphrase: string ) {
    const words = passphrase.trim().split(' ')
    if( words.length !== 12 ) return false;

    const mnemonicWords = bip39.wordlists.english
    let valid = true
    words.forEach(word => {
      if (mnemonicWords.indexOf(word) === -1) {
        valid = false;
      }
    });
    return valid
  }

  isAddressValid( address: string ) {
    let net = this.networks.haz;
    try {
      let addr = bitcoin.address.fromBase58Check(address)
      return net.validBase58VersionBytes.indexOf(addr.version) >= 0
    }
    catch(e) {
      try {
        let addr = bitcoin.address.fromBech32(address)
        return addr.prefix === net.validBech32Prefix
      } catch(e) {
        return false
      }
    }
  }

  getCurrentSeed() {
    return this.currentSeed;
  }

  getCurrentAddress( mnemonic: string, account: number ) {
    let root = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic))
    const node = root.derivePath(this.defaultPath(this.coinParams['Hazama'].number, account))
    let kp = bitcoin.ECPair.fromPrivateKey(node.privateKey)
    const { address } = bitcoin.payments.p2pkh({ pubkey: node.publicKey, network: this.coinParams['Hazama'].network})

    return this.isAddressValid(address)? address: null;
  }

  getKeyPair( mnemonic: string, account: number ) {
    let root = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic))
    const node = root.derivePath(this.defaultPath(this.coinParams['Hazama'].number, account))
    return bitcoin.ECPair.fromPrivateKey(node.privateKey)
  }

  decode( envelope ) {
    let msg = ztak.openEnvelope(Buffer.from(envelope, 'hex'))
    let lines = ztak.asm.unpack(msg.data).filter(x => x.opName !== 'NOOP' && x.opName !== 'END' && x.opName !== 'REQUIRE')
    let calls = []
    let params = []
    for (let i=0; i < lines.length; i++) {
      let item = lines[i]
      if (item.opName.startsWith('PUSH')) {
        params.push(item.params[0])
      } else if (item.opName === 'ECALL') {
        calls.push({ [item.params[0]]: params })
        params = []
      }
    }
    return { from: msg.from, calls }
  }

  async getTxInfo( tx: string ) {
    let txdata: any = await this.ztakSend('core.get', `/_/tx.${tx}`)
    if( txdata == null ) return null;

    let ob = this.decode(txdata);
    return ob;
  }

  async getBalances( address ) {
    let addrData: any = await this.ztakSend('core.get', `/_/addr.${address}`)

    let bals = { meta: {} }
    for (let x in addrData) {
      if (x.startsWith(WalletService.token)) {
        let n: any = await this.ztakSend('core.get', x);
        let owner = x.split('/').pop()

        let bal = (owner === address)? new BigNumber(n): new BigNumber(0);

        let token = x.split('/').slice(0, -1).join('/')
        let meta = await this.getMeta(token)
        if (meta && 'Info' in meta && 'decimals' in meta.Info) {
          bal = bal.dividedBy(this.divisor(meta.Info.decimals))
        }

        if( token === WalletService.token ) {
          bals[token] = Number(bal.toString())
          bals.meta[token] = meta
        }
      }
    }

    return bals;
  }

  async getHistory( address ) {
    let addrData: any = await this.ztakSend('core.get', `/_/addr.${address}`)

    let history = []
    for( let txid in addrData.txs ) {
      let ob = await this.getTxInfo(txid);
      if( ob == null ) continue;

      if( WalletService.token + ':send' in ob.calls[0] ) {
        let amount = new BigNumber(ob.calls[0][WalletService.token + ':send'][1][0])

        let meta = await this.getMeta(WalletService.token)
        if ('Info' in meta && 'decimals' in meta.Info) {
          amount = amount.dividedBy(this.divisor(meta.Info.decimals));
        }

        history.push({
          txid: txid,
          token: meta.Name,
          from: ob.from,
          to: ob.calls[0][WalletService.token + ':send'][0],
          amount: Number(amount.toString()),
          date: new Date(addrData.txs[txid]).toLocaleString()
        });
      }
    }

    return history;
  }

  private ztakNetwork = {
    "messagePrefix": "\u0018Hazama Signed Message:\n",
    "bech32": "haz",
    "bip32": {
      "public": "0x0488b21e",
      "private": "0x0488ade4"
    },
    "pubKeyHash": 100,
    "wif": 149
  }

  async send( token: string, destination: string, am: number ) {
    let amount:any = new BigNumber(am);

    let meta: any = await this.getMeta(token);
    if (meta && meta.Info && meta.Info.decimals) {
      let num = '1' + (new Array(meta.Info.decimals).fill('0')).join('')
      amount = Number(amount.multipliedBy(num).toString())
    }

    let res: any = await this.ztakSend('core.template', `fungible_token_send`, {
      path: token,
      destination: destination,
      amount: amount
    })

    try {
      return await this.signAndBroadcast(res);
    }
    catch(e) {
      return { error: e }
    }
  }

  async signAndBroadcast( res ) {
    if (res.startsWith('#asm')) {
      let kp = this.getKeyPair(this.getCurrentSeed(), 0);

      let compiled = ztak.asm.compile(res)
      let envelope = ztak.buildEnvelope(kp, compiled, this.ztakNetwork, false)
      let tx = await this.ztakSend('core.tx', envelope.toString('hex'))

      return tx
    }
  }

  private sendMsg = (method, params, cb) => { cb(console.log('Ztak not connected'), null) }

  ztakSend(method, ...params) {
    return new Promise((resolve, reject) => {
      this.sendMsg(method, params, (error, data) => {
        if (error) {
          reject(error)
        } else {
          resolve(data)
        }
      })
    })
  }

  divisor(n) {
    return parseInt('1' + (new Array(n).fill('0').join('')))
  }

  private cachedMeta = {}
  async getMeta(token) {
    if (token in this.cachedMeta) {
      return this.cachedMeta[token]
    } else {
      let meta: any = await this.ztakSend('core.get', token + '.meta')
      this.cachedMeta[token] = meta

      return meta
    }
  }

  private static SERVER_URL = 'wss://hazamaapi.indiesquare.net/ztak'
  private static RECONNECT_TIMEOUT = 5000
  private static CALL_TIMEOUT = 15000
  private socket
  private retryInterval
  private tryingOpen = false
  private reconn = 0
  private subs = {}
  private ztakSubscribeCallback: any = null;

  ztakSubscribe(regex, cb) {
    this.ztakSend('core.subscribe', regex)
    this.subs[regex] = cb
  }

  openSocket( ztakSubscribeCallback ) {
    if( ztakSubscribeCallback != null ) this.ztakSubscribeCallback = ztakSubscribeCallback;
    return new Promise((resolve, reject) => {
      if (this.tryingOpen || (this.socket && this.socket.readyState === 1)) return
      this.tryingOpen = true

      this.socket = new WebSocket(WalletService.SERVER_URL)

      this.socket.addEventListener('open', () => {
        resolve(true);
        this.tryingOpen = false
        if (this.retryInterval) {
          clearInterval(this.retryInterval)
          this.retryInterval = null
        }

        let lastId = 0
        let waitCbs = {}
        this.sendMsg = (method, params, cb) => {
          let ob = {
            jsonrpc: '2.0',
            id: lastId,
            method, params
          }

          waitCbs[lastId] = {cb, ts: Date.now(), method}
          this.socket.send(JSON.stringify(ob))
          lastId++
        }

        this.socket.addEventListener('message', (event) => {
          let ob
          try {
            ob = JSON.parse(event.data)
          } catch (e) {
            ob = null
          }

          if (ob) {
            if ('id' in ob && ob.id in waitCbs) {
              if (!ob.error) {
                waitCbs[ob.id].cb(null, ob.result)
              } else {
                waitCbs[ob.id].cb(ob.error)
              }

              delete waitCbs[ob.id]
            } else if ('method' in ob && ob.method === 'event') {
              // probably a subscription message
              for (let x in this.subs) {
                this.subs[x](...ob.params)
              }
            }
          }
        })

        setInterval(() => {
          let ts = Date.now()
          for (let x in waitCbs) {
            if (waitCbs[x].ts + WalletService.CALL_TIMEOUT < ts) {
              waitCbs[x].cb(new Error(`timeout on call: ${waitCbs[x].method}`))
              delete waitCbs[x]
            }
          }
        }, 1000)

        this.socket.addEventListener('close', () => {
          this.retryInterval = setInterval(() => this.openSocket(null), WalletService.RECONNECT_TIMEOUT)
          this.sendMsg = () => {}
        })

        if( this.ztakSubscribeCallback != null ) {
          this.ztakSubscribeCallback();
        }
      })

      this.socket.addEventListener('error', (err, data) => {
        reject();
        this.tryingOpen = false
        this.retryInterval = setInterval(() => this.openSocket(null), WalletService.RECONNECT_TIMEOUT)
        this.sendMsg = () => {}
      })
    })
  }

}
