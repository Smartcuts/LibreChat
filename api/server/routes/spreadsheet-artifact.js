const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const S3Service = require('~/server/services/Spreadsheet/S3Service');
const ExcelService = require('~/server/services/Spreadsheet/ExcelService');

const router = express.Router();

// All routes require authentication
router.use(requireJwtAuth);

// Initialize services
const s3Service = new S3Service();
const excelService = new ExcelService();

/**
 * Create new Excel spreadsheet artifact
 * POST /api/spreadsheet-artifact/create
 */
router.post('/create', async (req, res) => {
  try {
    const { headers, rows, title, conversationId, messageId } = req.body;
    const userId = req.user.id;

    // Validation
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: 'Headers are required and must be a non-empty array' });
    }

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Rows must be an array' });
    }

    const artifactId = uuidv4();

    // 1. Generate Excel file
    logger.info(`[SpreadsheetArtifact] Creating Excel file for artifact ${artifactId}`);
    const workbook = await excelService.createWorkbook(headers, rows, {
      sheetName: title || 'Sheet1',
    });
    const buffer = await excelService.toBuffer(workbook);

    // 2. Upload to S3 (creates first version)
    logger.info(`[SpreadsheetArtifact] Uploading to S3 for artifact ${artifactId}`);
    const { key: s3Key, versionId } = await s3Service.uploadSpreadsheet(
      userId,
      artifactId,
      buffer,
      { title, createdBy: userId },
    );

    // 3. Generate presigned URL for download
    const downloadUrl = await s3Service.getPresignedUrl(s3Key, versionId);

    logger.info(`[SpreadsheetArtifact] Successfully created artifact ${artifactId}`);

    res.status(201).json({
      artifactId,
      s3Key,
      versionId,
      downloadUrl,
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
        sheetCount: 1,
      },
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error creating artifact:', error);
    res.status(500).json({ error: error.message || 'Failed to create spreadsheet artifact' });
  }
});

/**
 * Update existing spreadsheet artifact (creates new version)
 * POST /api/spreadsheet-artifact/:artifactId/update
 * Body: { headers, rows, s3Key, changeDescription }
 */
router.post('/:artifactId/update', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const { headers, rows, s3Key, changeDescription } = req.body;
    const userId = req.user.id;

    // Validation
    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({ error: 'Headers are required' });
    }

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Rows are required' });
    }

    if (!s3Key) {
      return res.status(400).json({ error: 's3Key is required' });
    }

    // Validate user ownership via s3Key prefix
    if (!s3Key.startsWith(`users/${userId}/spreadsheets/`)) {
      return res.status(403).json({ error: 'Access denied: s3Key does not belong to user' });
    }

    // 1. Generate updated Excel file
    logger.info(`[SpreadsheetArtifact] Updating artifact ${artifactId}`);
    const workbook = await excelService.createWorkbook(headers, rows, {
      sheetName: 'Sheet1',
    });
    const buffer = await excelService.toBuffer(workbook);

    // 2. Upload to S3 (same key, creates new version automatically)
    const { versionId: newVersionId } = await s3Service.uploadSpreadsheet(
      userId,
      artifactId,
      buffer,
      {
        updatedAt: new Date().toISOString(),
        changeDescription: changeDescription || 'Updated via chat',
      },
    );

    // 3. Generate new presigned URL
    const downloadUrl = await s3Service.getPresignedUrl(s3Key, newVersionId);

    // 4. Get version history
    const versions = await s3Service.listVersions(s3Key);

    logger.info(`[SpreadsheetArtifact] Updated artifact ${artifactId} to version ${newVersionId}`);

    res.json({
      artifactId,
      s3Key,
      versionId: newVersionId,
      downloadUrl,
      timestamp: Date.now(),
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
      },
      versions: versions.map(v => ({
        versionId: v.versionId,
        timestamp: v.lastModified.getTime(),
        isLatest: v.isLatest,
      })),
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error updating artifact:', error);
    res.status(500).json({ error: error.message || 'Failed to update spreadsheet artifact' });
  }
});

/**
 * Get artifact with parsed data, metadata, and download URL
 * GET /api/spreadsheet-artifact/:artifactId?s3Key=...&versionId=...
 *
 * Query params (optional):
 * - s3Key: S3 key for the file (skips Supabase lookup if provided)
 * - versionId: Specific version to fetch (defaults to latest)
 */
router.get('/:artifactId', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const { s3Key: providedS3Key, versionId: providedVersionId } = req.query;
    const userId = req.user.id;

    let s3Key;
    let versionId = providedVersionId;

    // If s3Key provided in query, use it directly (skip Supabase)
    if (providedS3Key) {
      logger.info(`[SpreadsheetArtifact] Using provided s3Key: ${providedS3Key}`);
      s3Key = providedS3Key;

      // Validate s3Key format and user ownership
      if (!s3Key.startsWith(`users/${userId}/spreadsheets/`)) {
        return res.status(403).json({ error: 'Access denied: s3Key does not belong to user' });
      }
    } else {
      // Fall back to Supabase lookup (backward compatible)
      logger.info(`[SpreadsheetArtifact] Looking up artifact in Supabase: ${artifactId}`);
      const artifact = await supabaseService.getArtifact(artifactId, userId);
      if (!artifact) {
        return res.status(404).json({ error: 'Artifact not found or access denied' });
      }
      s3Key = artifact.s3_key;
      versionId = versionId || artifact.current_version_id;
    }

    // Download and parse Excel file from S3
    logger.info(`[SpreadsheetArtifact] Fetching and parsing Excel file from ${s3Key}`);
    const buffer = await s3Service.downloadSpreadsheet(s3Key, versionId);

    // Parse Excel file to extract data
    const parsedData = await excelService.parseWorkbook(buffer, {
      includeEmptyRows: false,
    });

    // Extract data (parseWorkbook returns flat structure with headers, rows, metadata)
    const headers = parsedData.headers || [];
    const rows = parsedData.rows || [];

    // Generate presigned URL for download
    const downloadUrl = await s3Service.getPresignedUrl(s3Key, versionId);

    // Get version history
    const versions = await s3Service.listVersions(s3Key);

    res.json({
      artifactId,
      s3Key,
      downloadUrl,
      headers,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
        sheetCount: parsedData.metadata?.sheetCount || 1,
        currentVersionId: versionId || versions.find(v => v.isLatest)?.versionId,
        fileSize: buffer.length,
      },
      versions: versions.map(v => ({
        versionId: v.versionId,
        timestamp: v.lastModified.getTime(),
        size: v.size,
        isLatest: v.isLatest,
      })),
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error fetching artifact:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch spreadsheet artifact' });
  }
});

/**
 * List version history for an artifact
 * GET /api/spreadsheet-artifact/:artifactId/versions
 */
router.get('/:artifactId/versions', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const userId = req.user.id;

    // Get artifact (verifies ownership)
    const artifact = await supabaseService.getArtifact(artifactId, userId);
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found or access denied' });
    }

    // Get all versions from S3
    const versions = await s3Service.listVersions(artifact.s3_key);

    // Generate presigned URLs for each version
    const versionsWithUrls = await Promise.all(
      versions.map(async (version) => {
        const downloadUrl = await s3Service.getPresignedUrl(
          artifact.s3_key,
          version.versionId,
        );

        return {
          versionId: version.versionId,
          timestamp: version.lastModified.getTime(),
          lastModified: version.lastModified.toISOString(),
          size: version.size,
          isLatest: version.isLatest,
          downloadUrl,
        };
      }),
    );

    res.json({
      artifactId,
      versions: versionsWithUrls,
      totalVersions: versionsWithUrls.length,
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error fetching versions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch version history' });
  }
});

/**
 * Restore a previous version (copies as new latest)
 * POST /api/spreadsheet-artifact/:artifactId/restore
 */
router.post('/:artifactId/restore', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const { versionId } = req.body;
    const userId = req.user.id;

    if (!versionId) {
      return res.status(400).json({ error: 'Version ID is required' });
    }

    // Get artifact (verifies ownership)
    const artifact = await supabaseService.getArtifact(artifactId, userId);
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found or access denied' });
    }

    // Restore version in S3 (copies as new latest)
    logger.info(`[SpreadsheetArtifact] Restoring version ${versionId} for artifact ${artifactId}`);
    const { versionId: newVersionId } = await s3Service.restoreVersion(
      artifact.s3_key,
      versionId,
    );

    // Update Supabase with new version ID
    await supabaseService.updateArtifact(artifactId, userId, newVersionId);

    // Generate presigned URL
    const downloadUrl = await s3Service.getPresignedUrl(artifact.s3_key, newVersionId);

    logger.info(`[SpreadsheetArtifact] Restored artifact ${artifactId} to version ${versionId} (new version: ${newVersionId})`);

    res.json({
      artifactId,
      restoredFromVersionId: versionId,
      newVersionId,
      downloadUrl,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error restoring version:', error);
    res.status(500).json({ error: error.message || 'Failed to restore version' });
  }
});

/**
 * Download specific version
 * GET /api/spreadsheet-artifact/:artifactId/download/:versionId
 */
router.get('/:artifactId/download/:versionId', async (req, res) => {
  try {
    const { artifactId, versionId } = req.params;
    const userId = req.user.id;

    // Get artifact (verifies ownership)
    const artifact = await supabaseService.getArtifact(artifactId, userId);
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found or access denied' });
    }

    // Generate presigned URL and redirect
    const downloadUrl = await s3Service.getPresignedUrl(artifact.s3_key, versionId, 300); // 5 min expiry

    res.redirect(downloadUrl);
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error downloading version:', error);
    res.status(500).json({ error: error.message || 'Failed to download version' });
  }
});

/**
 * Delete artifact and all versions
 * DELETE /api/spreadsheet-artifact/:artifactId
 */
router.delete('/:artifactId', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const userId = req.user.id;
    const { deleteVersions = false } = req.query;

    // Get artifact (verifies ownership)
    const artifact = await supabaseService.getArtifact(artifactId, userId);
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found or access denied' });
    }

    // Optionally delete all S3 versions
    let deletedVersions = 0;
    if (deleteVersions === 'true') {
      logger.info(`[SpreadsheetArtifact] Deleting all versions for artifact ${artifactId}`);
      deletedVersions = await s3Service.deleteAllVersions(artifact.s3_key);
    }

    // Delete from Supabase
    await supabaseService.deleteArtifact(artifactId, userId);

    logger.info(`[SpreadsheetArtifact] Deleted artifact ${artifactId} (${deletedVersions} versions removed)`);

    res.json({
      success: true,
      deletedArtifact: artifactId,
      deletedVersions,
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error deleting artifact:', error);
    res.status(500).json({ error: error.message || 'Failed to delete artifact' });
  }
});

/**
 * List all artifacts for the authenticated user
 * GET /api/spreadsheet-artifact/list
 */
router.get('/list/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      limit = '50',
      offset = '0',
      conversationId,
      orderBy = 'created_at',
      ascending = 'false',
    } = req.query;

    const { artifacts, total } = await supabaseService.listArtifacts(userId, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      conversationId,
      orderBy,
      ascending: ascending === 'true',
    });

    res.json({
      artifacts,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error listing artifacts:', error);
    res.status(500).json({ error: error.message || 'Failed to list artifacts' });
  }
});

/**
 * Update artifact title
 * PATCH /api/spreadsheet-artifact/:artifactId/title
 */
router.patch('/:artifactId/title', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const { title } = req.body;
    const userId = req.user.id;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Valid title is required' });
    }

    const artifact = await supabaseService.updateTitle(artifactId, userId, title);

    res.json({
      artifactId,
      title: artifact.title,
      updated: true,
    });
  } catch (error) {
    logger.error('[SpreadsheetArtifact] Error updating title:', error);
    res.status(500).json({ error: error.message || 'Failed to update title' });
  }
});

module.exports = router;
