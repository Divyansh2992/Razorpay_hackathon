const EventEmitter = require('events');

class AppEventBus extends EventEmitter {}

const eventBus = new AppEventBus();
eventBus.setMaxListeners(20);

module.exports = eventBus;
