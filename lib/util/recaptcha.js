var config  = require('config');

module.exports = {
  verify : function(g_recaptcha_response, cb) {
    // Skip recaptcha verification in test mode or if not configured
    if (config.isTest || !config.app.recaptcha || !config.app.recaptcha.secretkey) {
      return cb({ success : true });
    }

    fetch("https://www.google.com/recaptcha/api/siteverify", {
      method : 'POST',
      body   : new URLSearchParams({
          secret   : config.app.recaptcha.secretkey
        , response : g_recaptcha_response || ''
      })
    })
    .then(function(response) {
      if (response.status !== 200) {
        return { status : false };
      }
      return response.json();
    })
    .catch(function() {
      return { status : false };
    })
    .then(cb);
  }
};
