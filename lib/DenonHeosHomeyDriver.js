'use strict';

const Homey = require('homey');
const { Discover } = require('denon-heos');

module.exports = class DenonHeosHomeyDriver extends Homey.Driver {
  
  onInit() {    
    this.devices = {};
    
    this.discover = new Discover();
    this.discover.on('device', this.onDiscoverDevice.bind(this));
    this.discover.start();
  }
  
  onDiscoverDevice( device ) {
    //this.log('onDiscoverDevice', device);
    this.log(`Found device [${device.modelNumber}]: ${device.friendlyName} @ ${device.address}`);
    
    this.devices[device.udn] = device;
    this.emit(`device:${device.udn}`, device);
  }
  
  onPairListDevices( data, callback ) {
    const devices = Object.keys(this.devices).map(id => {
      const device = this.devices[id];
      return {
        name: device.friendlyName || device.modelName,
        data: { id },
      };
    });
    return callback(null, devices);
  }
  
  async getDevice(id) {
    if( this.devices[id] )
      return this.devices[id].instance;
       
   return new Promise(resolve => {
     this.once(`device:${id}`, device => {
       resolve(device.instance);
     });
   });
  }
  
}