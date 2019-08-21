'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { DenonHeos } = require('denon-heos');

module.exports = class DenonHeosHomeyDriver extends Homey.Driver {
  
  onInit() {    
    this.devices = {};
    
    const discoveryStrategy = Homey.ManagerDiscovery.getDiscoveryStrategy('heos');
    discoveryStrategy.on('result', this.onDiscoveryResult.bind(this));
  }
  
  onDiscoveryResult( discoveryResult ) {    
    fetch( discoveryResult.headers.location ).then(async res => {
      if(!res.ok)
        throw new Error(res.statusText);
      
      const body = await res.text();
      
      let address = discoveryResult.address;
      
      let manufacturer = matchBetweenTags('manufacturer', body);
      if( manufacturer !== 'Denon' ) return;
  
      let friendlyName = matchBetweenTags('friendlyName', body);
      if( friendlyName ) friendlyName = friendlyName.replace('ACT-', '');
      
      let udn = matchBetweenTags('UDN', body).replace('uuid:', '');
      
      if( this.devices[udn] ) {
        this.devices[udn].address = address;
        this.devices[udn].instance.setAddress(address);
      } else {     
        const instance = new DenonHeos({ address });  
        const device = this.devices[udn] = {
          udn,
          address,
          instance,
          friendlyName,
          modelName: matchBetweenTags('modelName', body),
          modelNumber: matchBetweenTags('modelNumber', body),
          deviceId: matchBetweenTags('DeviceID', body),
          wlanMac: matchBetweenTags('wlanMac', body),
        };
        
        this.emit(`device:${device.udn}`, device);
        this.log(`Found device [${device.udn}] ${device.friendlyName} @ ${device.address}`);
      }
      
    }).catch(this.error);
  }
  
  onPairListDevices( data, callback ) {
    const devices = Object.values(this.devices).map(device => {
      return {
        name: device.friendlyName || device.modelName,
        data: {
          id: device.udn,
        },
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

function matchBetweenTags( tagName, input ) {
  const re = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`);
  let result = input.match( re );
  if( result && typeof result[1] === 'string' )
    return result[1];
  return null;
}