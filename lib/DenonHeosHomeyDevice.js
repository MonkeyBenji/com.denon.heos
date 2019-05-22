'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

const CONNECT_RETRY_TIMEOUT = 1000 * 5;

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
    
    this.driver = this.getDriver();
    this._initDevice();
    
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
      this.speaker.disconnect().catch(this.error);
    }
  }
  
  _initDevice() {
    this.driver.getDevice(this.id).then(async speaker => {
      this.log('Found on network, connecting...');
      await speaker.connect();
      
      this.speaker = speaker;
      this.speaker
        .on('disconnected', () => {
          this.log('Disconnected');
          this.setUnavailable(Homey.__('loading'));
        })
        .on('watchdog_error', () => {
          this.log('Watchdog Error');
          this.setUnavailable(Homey.__('loading'));
        })
        .on('reconnected', () => {
          this.log('Reconnected');
          this.setAvailable();
          this.sync();
        })
      
      const players = await speaker.playerGetPlayers();
      if( !Array.isArray(players) )
        throw new Error('Speaker not yet ready');
      
      let player = players.find(player => {        
        return player.ip === this.speaker.address;
      });
      
      if(!player)
        throw new Error('Speaker not yet ready');
        
      this.pid = String(player.pid);
      
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
      
      setTimeout(() => {
        this._initDevice();
      }, CONNECT_RETRY_TIMEOUT);
    });
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
    
    this.speaker.playerGetNowPlayingMedia({ pid }).then(result => {
      return this._syncNowPlayingMedia(result);
    }).catch(this.error);
  }
  
  onSpeakerPlayerNowPlayingProgress({ pid, cur_pos, duration }) {
    if( pid !== this.pid ) return;
    // Not Implemented
  }
  
  /*
   * Syncing
   */
   
  sync() {
    const { pid } = this;
    
    this.speaker.playerGetNowPlayingMedia({ pid }).then(result => {
      return this._syncNowPlayingMedia(result);
    }).catch(this.error);
    
    this.speaker.playerGetPlayState({ pid }).then(result => {
      return this._syncPlayState({
        state: result.state,
      });
    }).catch(this.error);
    
    this.speaker.playerGetVolume({ pid }).then(result => {
      return this._syncVolume({
        volume: result.level,
      });      
    }).catch(this.error);
    
    this.speaker.playerGetMute({ pid }).then(result => {
      return this._syncVolume({
        mute: result.state,
      });
    }).catch(this.error);
    
    this.speaker.playerGetPlayMode({ pid }).then(result => {      
      this._syncShuffle({
        shuffle: result.shuffle,
      });
      
      this._syncRepeat({
        repeat: result.repeat,
      });
    }).catch(this.error);
    
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
        if( this.image.setStream ) {
          this.image.setStream(async ( stream ) => {
            const res = await fetch(image_url);
            if(!res.ok)
              throw new Error(res.statusText);
            return res.body.pipe(stream);
          });
        } else {          
          this.image.setBuffer(async () => {
            const res = await fetch(image_url);
            if(!res.ok)
              throw new Error(res.statusText);
            return res.buffer();
          });
        }
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
    const { pid } = this;
    return this.speaker.playerSetPlayState({
      pid,
      state: value ? 'play' : 'pause'
    });
  }
  
  async onCapabilitySpeakerPrev() {
    const { pid } = this;
    return this.speaker.playerPlayPrevious({
      pid,
    });
  }
  
  async onCapabilitySpeakerNext() {
    const { pid } = this;
    return this.speaker.playerPlayNext({
      pid,
    });
  }
  
  async onCapabilitySpeakerShuffle( value ) {
    const { pid } = this;
    return this.speaker.playerSetPlayMode({
      pid,
      shuffle: value ? 'on' : 'off',
    });
  }
  
  async onCapabilitySpeakerRepeat( value ) {
    const { pid } = this;
    
    let repeat;
    if( value === 'none' )
      repeat = 'off';
      
    if( value === 'track' )
      repeat = 'on_one';
      
    if( value === 'playlist' )
      repeat = 'on_all';    
      
    if(!repeat)
      return;
    
    return this.speaker.playerSetPlayMode({
      pid,
      repeat,
    });
  }
  
  async onCapabilityVolumeSet( value ) {
    const { pid } = this;
    return this.speaker.playerSetVolume({
      pid,
      level: value * 100,
    });
  }
  
  async onCapabilityVolumeMute( value ) {
    const { pid } = this;
    return this.speaker.playerSetMute({
      pid,
      mute: !!value,
    });
  }
  
  /*
   * Flow methods
   */
   
  async playAUXIn() {
    const { pid } = this;
    return this.speaker.browsePlayAuxIn1({ pid });
  }
  
}