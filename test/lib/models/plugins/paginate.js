var _      = require('underscore'),
    sinon  = require('sinon'),
    should = require('chai').should(),
    plugin = require('../../../../lib/models/plugins/paginate');

describe('paginate plugin', function() {
  var query = {
        sort : sinon.spy(function() {
          return this;
        }),
        limit : sinon.spy(function() {
          return this;
        }),
        select : sinon.spy(function() {
          return this;
        }),
        exec : sinon.spy(function(cb) {
          return this;
        })
      },
      model = {
        find : sinon.spy(function() {
          return query;
        }),
      },
      schema, options;

  beforeEach(function() {
    model.find.resetHistory();
    query.sort.resetHistory();
    query.limit.resetHistory();
    query.exec.resetHistory();
    schema  = {
      statics : {}
    };
    options = {};
  });

  function callPaginate(options, cb) {
    return schema.statics.paginate.call(model, options, cb);
  }

  describe('instantiation', function() {
    function shouldWork() {
      var err;
      try {
        plugin(schema, options);
      } catch(e) {
        err = e;
      };

      should.not.exist(err);
    }

    it('should require a sortBy option', function() {
      var err;

      try {
        plugin(schema, options);
      }
      catch(e) {
        err = e.toString();
      }
      should.exist(err);
      err.should.match(/requires.*sort\skey/i);
    });

    it('should accept a single sortBy option as a string', function() {
      options.sortBy = 'foo';
      shouldWork();
    });

    it('should accept a single sortBy option as an array', function() {
      options.sortBy = ['foo'];
      shouldWork();
    });

    it('should accept multiple sortBy options as an array', function() {
      options.sortBy = ['foo', 'bar'];
      shouldWork();
    });

    it('should not allow a default limit above the max limit', function() {
      var err;
      options.sortBy = 'foo';
      options.defaultLimit = 100;
      options.maxLimit     = 1;
      try {
        plugin(schema, options);
      }
      catch(e) {
        err = e;
      }
      should.exist(err);
      err.should.match(/default.*limit.*exceed.*max.*limit/i);
    });

    it('should provide a paginate method when all valid options are supplied', function() {
      options.sortBy = 'foo';
      options.defaultLimit = 1;
      options.maxLimit = 2;
      shouldWork();
      should.exist(schema.statics.paginate);
      schema.statics.paginate.should.be.a('function');
    });
  });

  describe('usage', function() {
    it('should return an unexecuted query if no callback is provided', function() {
      options.sortBy = 'foo';
      plugin(schema, options);
      var result = callPaginate();
      result.should.equal(query);
      query.exec.called.should.be.false;
    });

    it('should execute the query if a callback is provided', function() {
      options.sortBy = 'foo';
      plugin(schema, options);
      var cb = sinon.spy();
      var result = callPaginate(cb);
      query.exec.calledWithExactly(cb).should.be.true;
    });

    it('should die if an invalid sort key is provided', function() {
      var err;
      options.sortBy = 'foo';
      plugin(schema, options);
      try {
        callPaginate({
          sort : 'bar'
        })
      } catch(e) {
        err = e;
      }

      should.exist(err);
      err.should.match(/sort.*key.*not.*allowed/i);
    });

    describe('query instantiation', function() {
      it('should create a query via find', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate();
        model.find.calledOnce.should.be.true;
      });

      it('should construct a default condition if none is provided', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate();
        model.find.firstCall.calledWithExactly({foo:{'$exists':true}}).should.be.true;
      });

      it('should use the where option as the query if it is provided', function() {
        var whereClause = { a : 'b' },
            expectedQuery = {
              a : 'b',
              foo : {'$exists' : true}
            };

        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate({
          where : whereClause
        });
        model.find.firstCall.calledWithExactly(expectedQuery).should.be.true;
      });

      it('should add an after condition to the query if it is provided', function() {
        var whereClause = { a : 'b' };
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate({
          where : whereClause,
          after : 1
        });
        model.find.firstCall.calledWithExactly({
          foo : { '$exists': true, '$gt' : 1 },
          a   : 'b'
        }).should.be.true;
      });
    });

    describe('sorting', function() {
      it('should modify the query with a sort', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate();
        query.sort.calledOnce.should.be.true;
      });

      it('should by default sort ascending by the default sortBy value', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate();
        query.sort.firstCall.calledWithExactly({
          foo : 1
        }).should.be.true;
      });

      it('should sort ascending if the provided sort is positive', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate({
          sort : 'foo'
        });
        query.sort.firstCall.calledWithExactly({
          foo : 1
        }).should.be.true;
      });

      it('should sort descending if the provided sort is negative', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate({
          sort : '-foo'
        });
        query.sort.firstCall.calledWithExactly({
          foo : -1
        }).should.be.true;
      });
    });

    describe('limiting', function() {
      it('should modify the query with a limit', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate();
        query.limit.calledOnce.should.be.true;
      });

      it('should use the default limit if none is provided', function() {
        options.sortBy = 'foo';
        options.defaultLimit = 5;
        plugin(schema, options);
        callPaginate();
        query.limit.firstCall.calledWithExactly(options.defaultLimit).should.be.true;
      });

      it('should use the supplied limit', function() {
        options.sortBy = 'foo';
        plugin(schema, options);
        callPaginate({limit:2});
        query.limit.firstCall.calledWithExactly(2).should.be.true;
      });

      it('should not allow the supplied limit to exceed the max limit', function() {
        var err;
        options.sortBy = 'foo';
        options.defaultLimit = 1;
        options.maxLimit = 5;
        plugin(schema, options);
        try {
          callPaginate({limit:6});
        } catch(e) {
          err = e;
        }

        should.exist(err);
        err.should.match(/limit.*less.*than.*max.*limit/i);
      });
    });
  });
});