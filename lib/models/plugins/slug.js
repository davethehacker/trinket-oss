var _        = require('underscore'),
    mongoose = require('mongoose'),
    ObjectId = mongoose.SchemaTypes.ObjectId,
    sluggify = require('limax'),
    tr       = require('transliteration').slugify;

module.exports = function(schema, options) {
  options = _.extend({
    path:  'name',
    index: true
  }, options || {});

  var path = options.path;

  schema.add({ slug: { type: String }, index: options.index });
  schema.pre('save', function(next) {
    if (this.isModified(path)) {
      // limax >= 2 defaults separateNumbers to false; keep the historical
      // behaviour so newly generated slugs match existing ones.
      this.slug = sluggify(this[path], { separateNumbers: true });
      if (this.slug.length === 0) {
        try {
          // transliteration >= 2 allows `_.~` by default; keep the old charset
          this.slug = tr(this[path], { allowedChars: 'a-zA-Z0-9' });
        } catch(e) {
          console.log("transliteration slugify err:", e, this[path]);
        }

        // if still no slug, make it something random
        if (this.slug.length === 0) {
          this.slug = Math.random().toString(36).slice(-8);
        }
      }
    }

    return next();
  });
};
