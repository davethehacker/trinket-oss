var _            = require('underscore'),
    db           = require('../../config/db'),
    mongoose     = require('mongoose'),
    initializing = true,
    instance;

function DB() {
  var self = this;
  this._isConnected = false;
  // Explicit wrappers instead of _.bindAll: underscore >= 1.9 no longer uses
  // native bind, so bound functions report length 0 and mocha would call them
  // as synchronous hooks without a `done` callback.
  this.ensureConnection = function(done) { return DB.prototype.ensureConnection.call(self, done); };
  this.reset = function(done) { return DB.prototype.reset.call(self, done); };
}

_.extend(DB.prototype, {
  ensureConnection : function(done) {
    var self = this;

    if (self.isConnected()) return done();

    (function wait() {
      if (self.isConnected()) {
        return done();
      }
      setTimeout(wait, 0);
    })();
  },

  reset : function(done) {
    if (!this.isConnected()) return done();

    mongoose.connection.db.dropDatabase(function() {
      done();
    });
  },

  isConnected : function() {
    return this._isConnected;
  }
});

instance = new DB();

function checkState() {
  switch(mongoose.connection.readyState) {
    case 0:
      console.log('mongoose connection died, reconnecting...');
      db.connect();
    case 1:
      // if initializing, clear the db
      if (initializing) {
        initializing = false;
        mongoose.connection.db.dropDatabase(function() {
          instance._isConnected = true;
        });
      }
      else {
        instance._isConnected = true;
      }
      
      break;
    default:
      setTimeout(checkState, 0);
  }
}

checkState();

module.exports = instance;
