process.env.NODE_ENV = 'test';

var chai           = require('chai'),
    // chai-as-promised and sinon-chai are ES modules; require() returns the namespace
    chaiAsPromised = require('chai-as-promised'),
    sinonChai      = require('sinon-chai');

chai.should();
chai.use(chaiAsPromised.default || chaiAsPromised);
chai.use(sinonChai.default || sinonChai);

// Tests run without Redis: config/test.yaml disables it so the in-memory
// store and queue implementations are used.
var app = require('../app.js'),
    db  = require('./helpers/db');

// Start the server's caches/plugins (session store etc.) without binding a
// port: config/test.yaml sets app.start to false, and an uninitialized hapi
// server cannot serve requests that touch the session cache.
module.exports = {
  mochaHooks : {
    beforeAll : async function() {
      var server = await app;
      await server.initialize();
    }
  }
};
