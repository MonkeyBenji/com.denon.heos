'use strict';

const Homey = require('homey');
const DenonHeosHomeyDriver = require('../../lib/DenonHeosHomeyDriver');

module.exports = class extends DenonHeosHomeyDriver {
	
	onInit(...props) {
  	super.onInit(...props);
  	
  	new Homey.FlowCardAction('play_aux_in')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playAUXIn();
  	  });
	}
	
}