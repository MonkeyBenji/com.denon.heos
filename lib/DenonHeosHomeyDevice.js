'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

module.exports = class DenonHeosHomeyDevice extends Homey.Device {
  
  /*
   * Homey Listeners
   */
  
  onInit() {
    this.setUnavailable(Homey.__('loading'));
    
    this.speaker = null;
    
    const { id } = this.getData();
    this.id = id;
    
    this.pid = null;
    this.gid = null;
    
    this.driver = this.getDriver();
    this.driver.getDevice(id).then(speaker => {
      this.log('Found on network, connecting...');
      return new Promise((resolve, reject) => {
        return speaker.connect(err => {
          if(err) return reject(err);
          return resolve(speaker);
        });
      });
    }).then(speaker => {
      this.speaker = speaker;
      
      return new Promise((resolve, reject) => {
        speaker.once('error', reject);
        return speaker.playerGetPlayers((err, result) => {
          if(err) return reject(err);
          return resolve(result);
        });
      }).then(result => result.payload);
    }).then(players => {
      let player = players.find(player => {        
        return player.ip === this.speaker.address;
      });
      
      if(!player) {
        // Dangerous assumption: own player doesn't return an IP
        player = players.find(player => {
          if(typeof player.ip === 'undefined')
            return player;
        });
      }
      
      if(!player)
        throw new Error('Cannot find speaker');
        
      this.pid = String(player.pid);
      this.gid = String(player.gid) || null;
      
      if(!this.pid)
        throw new Error('Missing Player ID');
      
      this.log(`[${this.getName()}]`, `Connected to speaker - PID: ${this.pid}`);
      this.speaker.on('player_volume_changed', this.onSpeakerPlayerVolumeChanged.bind(this));
      this.speaker.on('player_state_changed', this.onSpeakerPlayerStateChanged.bind(this));
      this.speaker.on('player_now_playing_changed', this.onSpeakerPlayerNowPlayingChanged.bind(this));
      this.speaker.on('player_now_playing_progress', this.onSpeakerPlayerNowPlayingProgress.bind(this));
      this.speaker.on('repeat_mode_changed', this.onSpeakerRepeatModeChanged.bind(this));
      this.speaker.on('shuffle_mode_changed', this.onSpeakerShuffleModeChanged.bind(this));
      this.setAvailable();
      this.sync();
    }).catch(err => {
      this.error(err);
      this.setUnavailable(err);
    });
    
    this.registerCapabilityListener('speaker_playing', this.onCapabilitySpeakerPlaying.bind(this));
    this.registerCapabilityListener('speaker_prev', this.onCapabilitySpeakerPrev.bind(this));
    this.registerCapabilityListener('speaker_next', this.onCapabilitySpeakerNext.bind(this));
    this.registerCapabilityListener('speaker_shuffle', this.onCapabilitySpeakerShuffle.bind(this));
    this.registerCapabilityListener('speaker_repeat', this.onCapabilitySpeakerRepeat.bind(this));
    this.registerCapabilityListener('volume_set', this.onCapabilityVolumeSet.bind(this));
    this.registerCapabilityListener('volume_mute', this.onCapabilityVolumeMute.bind(this));
    
    this.image = new Homey.Image('jpg');
    this.image.setUrl(null);
    this.image.register().then(() => {
      this.setAlbumArtImage(this.image);
    }).catch(this.error);
  }
  
  onDeleted() {
    if( this.speaker ) {
      this.speaker.disconnect(err => {
        if( err ) return this.error(err);
      });
    }
  }  
  
  /*
   * Heos Listeners
   */
  onSpeakerPlayerVolumeChanged({ pid, level, mute }) {
    if( pid !== this.pid ) return;
    this._syncVolume({ level, mute });
  }
  
  onSpeakerPlayerStateChanged({ pid, state }) {
    if( pid !== this.pid ) return;
    this._syncPlayState({ state });
    
  }
  
  onSpeakerRepeatModeChanged({ pid, repeat }) {
    if( pid !== this.pid ) return;
    this._syncRepeat({ repeat });
  }
  
  onSpeakerShuffleModeChanged({ pid, shuffle }) {
    if( pid !== this.pid ) return;
    this._syncShuffle({ shuffle });
  }
  
  onSpeakerPlayerNowPlayingChanged({ pid }) {
    if( pid !== this.pid ) return;
    
    this.speaker.playerGetNowPlayingMedia(this.pid, (err, result) => {
      if( err ) return this.error(err);
      return this._syncNowPlayingMedia(result.payload);
    });
  }
  
  onSpeakerPlayerNowPlayingProgress({ pid, cur_pos, duration }) {
    if( pid !== this.pid ) return;
    // Not Implemented
  }
  
  /*
   * Syncing
   */
   
  sync() {
    this.speaker.playerGetNowPlayingMedia(this.pid, (err, result) => {
      if( err ) return this.error(err);
      return this._syncNowPlayingMedia(result.payload);
    });
    
    this.speaker.playerGetPlayState(this.pid, (err, result) => {
      if( err ) return this.error(err);
      return this._syncPlayState({
        state: result.message.state,
      });        
    });
    
    this.speaker.playerGetVolume(this.pid, (err, result) => {
      if( err ) return this.error(err);
      return this._syncVolume({
        volume: result.message.level,
      });      
    });
    
    this.speaker.playerGetMute(this.pid, (err, result) => {
      if( err ) return this.error(err);
      return this._syncVolume({
        mute: result.message.state,
      });      
    });
    
    this.speaker.playerGetPlayMode(this.pid, (err, result) => {
      if( err ) return this.error(err);
      
      this._syncShuffle({
        shuffle: result.message.shuffle,
      });
      
      this._syncRepeat({
        repeat: result.message.repeat,
      });
    });
    
  }
  
  _syncNowPlayingMedia({ song, album, artist, image_url }) {
    this.setCapabilityValue('speaker_track', song || null).catch(this.error);
    this.setCapabilityValue('speaker_artist', artist || null).catch(this.error);
    this.setCapabilityValue('speaker_album', album || null).catch(this.error);
    
    if( typeof image_url === 'string' ) {
      if( image_url.startsWith('https://') ) {
        this.image.setUrl(image_url);        
        this.image.update().catch(this.error);
      } else {
        this.image.setBuffer(async () => {
          const res = await fetch(image_url);
          if(!res.ok)
            throw new Error(res.statusText);
          return res.buffer();
        });
        this.image.update().catch(this.error);
      }
    } else {
      this.image.setUrl(null);
      this.image.update().catch(this.error);
    }
  }
  
  _syncPlayState({ state }) {
    if( state === 'play' )
      this.setCapabilityValue('speaker_playing', true).catch(this.error);
    
    if( state === 'stop' || state === 'pause' )
      this.setCapabilityValue('speaker_playing', false).catch(this.error);
  }
  
  _syncVolume({ level, mute }) {
    if( typeof level !== 'undefined' )
      this.setCapabilityValue('volume_set', parseInt(level) / 100).catch(this.error);
      
    if( typeof mute !== 'undefined' )
      this.setCapabilityValue('volume_mute', mute === 'on').catch(this.error);
    
  }
  
  _syncShuffle({ shuffle }) {
    if( shuffle === 'on' )
      this.setCapabilityValue('speaker_shuffle', true).catch(this.error);
      
    if( shuffle === 'off' )
      this.setCapabilityValue('speaker_shuffle', false).catch(this.error);
  }
  
  _syncRepeat({ repeat }) {
    if( repeat === 'off' )
      this.setCapabilityValue('speaker_repeat', 'none').catch(this.error);
      
    if( repeat === 'on_one' )
      this.setCapabilityValue('speaker_repeat', 'track').catch(this.error);
      
    if( repeat === 'on_all' )
      this.setCapabilityValue('speaker_repeat', 'playlist').catch(this.error); 
  }
  
  /*
   * Capability Listeners
   */
  async onCapabilitySpeakerPlaying( value ) {
    return new Promise((resolve, reject) => {
      this.speaker.playerSetPlayState(this.pid, value ? 'play' : 'pause', err => {
        if(err) return reject(err);
        resolve();
      });
    });
  }
  
  async onCapabilitySpeakerPrev() {
    return new Promise((resolve, reject) => {
      this.speaker.playerPlayPrevious(this.pid, err => {
        if(err) return reject(err);
        resolve();
      });
    });
  }
  
  async onCapabilitySpeakerNext() {
    return new Promise((resolve, reject) => {
      this.speaker.playerPlayNext(this.pid, err => {
        if(err) return reject(err);
        resolve();
      });
    });
  }
  
  async onCapabilitySpeakerShuffle( value ) {
    return new Promise((resolve, reject) => {
      this.speaker.playerSetPlayMode(this.pid, {
        shuffle: value ? 'on' : 'off',
      }, err => {
        if(err) return reject(err);
        resolve();
      });
    });
  }
  
  async onCapabilitySpeakerRepeat( value ) {
    let repeat;
    if( value === 'none' )
      repeat = 'off';
      
    if( value === 'track' )
      repeat = 'on_one';
      
    if( value === 'playlist' )
      repeat = 'on_all';    
      
    if(!repeat)
      return;
    
    return new Promise((resolve, reject) => {
      this.speaker.playerSetPlayMode(this.pid, {
        repeat,
      }, err => {
        if(err) return reject(err);
        resolve();
      });
    });
  }
  
  async onCapabilityVolumeSet( value ) {
    return new Promise((resolve, reject) => {
      this.speaker.playerSetVolume(this.pid, value * 100, err => {
        if(err) return reject(err);
        resolve();
      });
    });    
  }
  
  async onCapabilityVolumeMute( value ) {
    return new Promise((resolve, reject) => {
      this.speaker.playerSetMute(this.pid, value, err => {
        if(err) return reject(err);
        resolve();
      });
    });    
  }
  
}