const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const { logger } = require('@librechat/data-schemas');
const { getS3Client, getS3Bucket, getPresignedUrlExpiry } = require('~/server/utils/s3Config');

class S3Service {
  constructor() {
    this.client = getS3Client();
    this.bucket = getS3Bucket();
    this.presignedUrlExpiry = getPresignedUrlExpiry();
  }

  /**
   * Generate S3 key for a spreadsheet artifact
   * @param {string} userId - User ID
   * @param {string} artifactId - Artifact ID
   * @returns {string} S3 key
   */
  generateS3Key(userId, artifactId) {
    return `users/${userId}/spreadsheets/${artifactId}.xlsx`;
  }

  /**
   * Upload spreadsheet to S3 with versioning
   * S3 automatically creates new version when same key is overwritten
   * @param {string} userId - User ID
   * @param {string} artifactId - Artifact ID
   * @param {Buffer} buffer - Excel file buffer
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {Promise<{key: string, versionId: string}>} Upload result
   */
  async uploadSpreadsheet(userId, artifactId, buffer, metadata = {}) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    const key = this.generateS3Key(userId, artifactId);

    try {
      // Use Upload for better performance with large files (multipart upload)
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          Metadata: {
            userId,
            artifactId,
            uploadedAt: new Date().toISOString(),
            ...metadata,
          },
          // Ensure versioning is used
          // S3 bucket must have versioning enabled for this to work
        },
      });

      const result = await upload.done();

      logger.info(
        `[S3Service] Uploaded spreadsheet ${artifactId} for user ${userId}, VersionId: ${result.VersionId}`,
      );

      return {
        key,
        versionId: result.VersionId,
      };
    } catch (error) {
      logger.error('[S3Service] Failed to upload spreadsheet:', error);
      throw new Error(`Failed to upload spreadsheet to S3: ${error.message}`);
    }
  }

  /**
   * Download a specific version of a spreadsheet
   * @param {string} key - S3 object key
   * @param {string} [versionId] - Specific version ID (optional, defaults to latest)
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadSpreadsheet(key, versionId = null) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(versionId && { VersionId: versionId }),
      });

      const response = await this.client.send(command);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      logger.info(
        `[S3Service] Downloaded spreadsheet ${key}${versionId ? ` version ${versionId}` : ''}`,
      );

      return buffer;
    } catch (error) {
      logger.error('[S3Service] Failed to download spreadsheet:', error);
      throw new Error(`Failed to download spreadsheet from S3: ${error.message}`);
    }
  }

  /**
   * List all versions of a spreadsheet
   * @param {string} key - S3 object key
   * @returns {Promise<Array>} List of versions with metadata
   */
  async listVersions(key) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: key,
      });

      const response = await this.client.send(command);

      // Filter to only include versions of the exact key (not similar keys)
      const versions = (response.Versions || [])
        .filter((v) => v.Key === key)
        .map((version) => ({
          versionId: version.VersionId,
          lastModified: version.LastModified,
          size: version.Size,
          isLatest: version.IsLatest || false,
          etag: version.ETag,
        }))
        .sort((a, b) => b.lastModified - a.lastModified); // Sort newest first

      logger.info(`[S3Service] Listed ${versions.length} versions for ${key}`);

      return versions;
    } catch (error) {
      logger.error('[S3Service] Failed to list versions:', error);
      throw new Error(`Failed to list spreadsheet versions: ${error.message}`);
    }
  }

  /**
   * Generate presigned URL for downloading a specific version
   * @param {string} key - S3 object key
   * @param {string} [versionId] - Specific version ID (optional)
   * @param {number} [expiresIn] - URL expiry in seconds (optional)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(key, versionId = null, expiresIn = null) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(versionId && { VersionId: versionId }),
      });

      const url = await getSignedUrl(
        this.client,
        command,
        { expiresIn: expiresIn || this.presignedUrlExpiry },
      );

      logger.info(
        `[S3Service] Generated presigned URL for ${key}${versionId ? ` version ${versionId}` : ''}`,
      );

      return url;
    } catch (error) {
      logger.error('[S3Service] Failed to generate presigned URL:', error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Restore a previous version by copying it as the new latest version
   * @param {string} key - S3 object key
   * @param {string} versionId - Version ID to restore
   * @returns {Promise<{versionId: string}>} New version ID
   */
  async restoreVersion(key, versionId) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      // Copy the old version to itself, creating a new latest version
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${key}?versionId=${versionId}`,
        Key: key,
      });

      const response = await this.client.send(command);

      logger.info(
        `[S3Service] Restored version ${versionId} of ${key} as new latest (VersionId: ${response.VersionId})`,
      );

      return {
        versionId: response.VersionId,
      };
    } catch (error) {
      logger.error('[S3Service] Failed to restore version:', error);
      throw new Error(`Failed to restore spreadsheet version: ${error.message}`);
    }
  }

  /**
   * Delete a specific version of a spreadsheet
   * WARNING: This permanently deletes the version
   * @param {string} key - S3 object key
   * @param {string} versionId - Version ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteVersion(key, versionId) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
        VersionId: versionId,
      });

      await this.client.send(command);

      logger.info(`[S3Service] Deleted version ${versionId} of ${key}`);

      return true;
    } catch (error) {
      logger.error('[S3Service] Failed to delete version:', error);
      throw new Error(`Failed to delete spreadsheet version: ${error.message}`);
    }
  }

  /**
   * Delete all versions of a spreadsheet (cleanup)
   * WARNING: This permanently deletes all versions
   * @param {string} key - S3 object key
   * @returns {Promise<number>} Number of versions deleted
   */
  async deleteAllVersions(key) {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const versions = await this.listVersions(key);

      let deletedCount = 0;
      for (const version of versions) {
        await this.deleteVersion(key, version.versionId);
        deletedCount++;
      }

      logger.info(`[S3Service] Deleted all ${deletedCount} versions of ${key}`);

      return deletedCount;
    } catch (error) {
      logger.error('[S3Service] Failed to delete all versions:', error);
      throw new Error(`Failed to delete all spreadsheet versions: ${error.message}`);
    }
  }

  /**
   * Check if S3 versioning is enabled on the bucket
   * @returns {Promise<boolean>} Versioning status
   */
  async isVersioningEnabled() {
    if (!this.client) {
      return false;
    }

    try {
      const { GetBucketVersioningCommand } = require('@aws-sdk/client-s3');
      const command = new GetBucketVersioningCommand({
        Bucket: this.bucket,
      });

      const response = await this.client.send(command);

      const enabled = response.Status === 'Enabled';

      if (!enabled) {
        logger.warn(`[S3Service] Versioning is NOT enabled on bucket ${this.bucket}`);
      }

      return enabled;
    } catch (error) {
      logger.error('[S3Service] Failed to check versioning status:', error);
      return false;
    }
  }
}

module.exports = S3Service;
