// Thin wrapper around the AWS SDK for JavaScript v3 S3 client.
//
// aws-sdk v2 reached end-of-support, so the app talks to S3 through these
// promise-returning helpers instead of `new AWS.S3()`. The client is created
// lazily so the app still boots when S3 is not configured (features.assets off).
var config = require('config');
var S3 = require('@aws-sdk/client-s3');
var presigner = require('@aws-sdk/s3-request-presigner');

var client = null;

function getClient() {
  if (client) {
    return client;
  }

  var awsConfig = config.aws || {};
  var options = {
    region : awsConfig.region || 'us-east-1'
  };

  // Fall back to the SDK's default credential chain (env vars, instance
  // profile, ...) when no static keys are configured, as aws-sdk v2 did.
  if (awsConfig.keyId && awsConfig.key) {
    options.credentials = {
      accessKeyId     : awsConfig.keyId,
      secretAccessKey : awsConfig.key
    };
  }

  // S3-compatible storage (MinIO, DigitalOcean Spaces, ...)
  if (awsConfig.endpoint) {
    options.endpoint       = awsConfig.endpoint;
    options.forcePathStyle = awsConfig.forcePathStyle !== false;
  }

  client = new S3.S3Client(options);
  return client;
}

function bodyToBuffer(body) {
  if (!body) {
    return Promise.resolve(Buffer.alloc(0));
  }
  return body.transformToByteArray().then(function(bytes) {
    return Buffer.from(bytes);
  });
}

module.exports = {
  getClient : getClient,

  // params: { Bucket, Key, Body, ContentType, ... }
  putObject : function(params) {
    return getClient().send(new S3.PutObjectCommand(params));
  },

  // Resolves with the object body as a Buffer
  getObjectBuffer : function(params) {
    return getClient().send(new S3.GetObjectCommand(params)).then(function(data) {
      return bodyToBuffer(data.Body);
    });
  },

  // Resolves with the object body as a Node.js Readable stream
  getObjectStream : function(params) {
    return getClient().send(new S3.GetObjectCommand(params)).then(function(data) {
      return data.Body;
    });
  },

  deleteObject : function(params) {
    return getClient().send(new S3.DeleteObjectCommand(params));
  },

  // params: { Bucket, Key, Expires (seconds) } - same shape as v2 getSignedUrl
  getSignedGetUrl : function(params) {
    var command = new S3.GetObjectCommand({ Bucket : params.Bucket, Key : params.Key });
    return presigner.getSignedUrl(getClient(), command, { expiresIn : params.Expires || 900 });
  }
};
