var moment = require('moment');

function EmailStore(getClient) {
  var api = {
    datehourKey : function() {
      return moment().format("YYYY-MM-DD-HH");
    },
    incrementType : async function(type) {
      var key = "email:" + type + ":" + api.datehourKey();
      var client = await getClient();
      return await client.incr(key);
    },
    thresholdExceeded : async function(options) {
      var type = options.type || ""
        , addr = options.address.replace(/\./g, "-")
        , key  = "email-threshold:" + type + ":" + api.datehourKey() + ":" + addr;
      var client = await getClient();
      return await client.incr(key);
    },
    blockListLookup : async function(domain) {
      var client = await getClient();
      // node-redis >= 5 returns 1/0 instead of a boolean
      return Boolean(await client.sIsMember('email:blocklist', domain));
    }
  };

  return api;
}

module.exports = EmailStore;
