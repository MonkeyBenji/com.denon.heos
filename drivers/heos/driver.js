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
  	new Homey.FlowCardAction('play_hdmi_1')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playHDMI1();
  	  });
  	new Homey.FlowCardAction('play_hdmi_2')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playHDMI2();
  	  });
  	new Homey.FlowCardAction('play_hdmi_3')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playHDMI3();
  	  });
  	new Homey.FlowCardAction('play_hdmi_4')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playHDMI4();
	  });
	new Homey.FlowCardAction('play_hdmi_arc_1')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.playHDMIARC1();
	  });


	new Homey.FlowCardAction('volume_up')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.onCapabilityVolumeUp();
  	  });
	new Homey.FlowCardAction('volume_down')
  	  .register()
  	  .registerRunListener(({ device }) => {
    	  return device.onCapabilityVolumeDown();
  	  });
	}
	
}