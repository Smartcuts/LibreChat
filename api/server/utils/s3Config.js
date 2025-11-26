const { S3Client } = require('@aws-sdk/client-s3');
const { logger } = require('@librechat/data-schemas');

let s3Client = null;

/**
 * Initialize and return S3 client singleton
 * @returns {S3Client|null}
 */
function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    logger.warn(
      '[S3] Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. Spreadsheet artifacts will not work.',
    );
    return null;
  }

  try {
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    logger.info(`[S3] Client initialized successfully (region: ${region})`);
    return s3Client;
  } catch (error) {
    logger.error('[S3] Failed to initialize client:', error);
    return null;
  }
}

/**
 * Get S3 bucket name from environment
 * @returns {string}
 */
function getS3Bucket() {
  const bucket = process.env.AWS_S3_BUCKET || 'librechat-spreadsheets';
  return bucket;
}

/**
 * Get presigned URL expiry time in seconds
 * @returns {number}
 */
function getPresignedUrlExpiry() {
  return parseInt(process.env.S3_PRESIGNED_URL_EXPIRY, 10) || 3600; // Default 1 hour
}

module.exports = {
  getS3Client,
  getS3Bucket,
  getPresignedUrlExpiry,
};
