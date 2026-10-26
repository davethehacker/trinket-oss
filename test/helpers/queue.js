var sinon   = require('sinon'),
    queues  = require('../../lib/util/queues'),
    // the snapshots queue is disabled and no longer exported by lib/util/queues
    snapshotQueue = typeof queues.snapshots === 'function' ? queues.snapshots() : null;

module.exports = {
  snapshotQueue : snapshotQueue,
  stub : function() {
    before(function() {
      if (!snapshotQueue) return;
      sinon.stub(snapshotQueue, 'add').callsFake(function(data) {
        return {
          then : function(f) {
            f();
          }
        };
      });
    });

    after(function() {
      if (snapshotQueue) snapshotQueue.add.restore();
    });
  }
};
