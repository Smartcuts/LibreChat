const ExcelJS = require('exceljs');
const { logger } = require('@librechat/data-schemas');

class ExcelService {
  /**
   * Create a new workbook from headers and rows
   * @param {string[]} headers - Column headers
   * @param {Array<Array<any>>} rows - Data rows
   * @param {Object} [options={}] - Workbook options
   * @param {string} [options.sheetName='Sheet1'] - Worksheet name
   * @param {boolean} [options.autoFormat=true] - Auto-format columns
   * @param {boolean} [options.freezeHeader=true] - Freeze header row
   * @returns {Promise<ExcelJS.Workbook>} Excel workbook
   */
  async createWorkbook(headers, rows, options = {}) {
    const {
      sheetName = 'Sheet1',
      autoFormat = true,
      freezeHeader = true,
    } = options;

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'LibreChat';
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet(sheetName);

      // Add header row with formatting
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

      // Add data rows
      rows.forEach((row) => {
        worksheet.addRow(row);
      });

      if (autoFormat) {
        // Auto-size columns based on content
        worksheet.columns.forEach((column, index) => {
          let maxLength = headers[index]?.length || 10;

          rows.forEach((row) => {
            const cellValue = row[index];
            if (cellValue != null) {
              const length = String(cellValue).length;
              if (length > maxLength) {
                maxLength = length;
              }
            }
          });

          // Set column width (max 50 characters)
          column.width = Math.min(maxLength + 2, 50);
        });

        // Apply borders to all cells with data
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          row.eachCell({ includeEmpty: false }, (cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        });
      }

      if (freezeHeader) {
        // Freeze the header row
        worksheet.views = [
          { state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' },
        ];
      }

      logger.info(
        `[ExcelService] Created workbook with ${rows.length} rows and ${headers.length} columns`,
      );

      return workbook;
    } catch (error) {
      logger.error('[ExcelService] Failed to create workbook:', error);
      throw new Error(`Failed to create Excel workbook: ${error.message}`);
    }
  }

  /**
   * Parse an Excel file buffer into headers and rows
   * @param {Buffer} buffer - Excel file buffer
   * @param {Object} [options={}] - Parse options
   * @param {string|number} [options.sheetIndex=0] - Sheet index or name
   * @param {boolean} [options.includeEmpty=false] - Include empty rows
   * @returns {Promise<{headers: string[], rows: Array<Array<any>>, metadata: Object}>}
   */
  async parseWorkbook(buffer, options = {}) {
    const {
      sheetIndex = 0,
      includeEmpty = false,
    } = options;

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // Get worksheet by index or name
      const worksheet = typeof sheetIndex === 'number'
        ? workbook.worksheets[sheetIndex]
        : workbook.getWorksheet(sheetIndex);

      if (!worksheet) {
        throw new Error(`Worksheet ${sheetIndex} not found`);
      }

      // Extract headers from first row
      const headerRow = worksheet.getRow(1);
      const headers = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = cell.value?.toString() || '';
      });

      // Extract data rows
      const rows = [];
      const startRow = 2; // Skip header row
      const endRow = worksheet.rowCount;

      for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
        const row = worksheet.getRow(rowNum);

        // Check if row is empty
        const isEmpty = !row.hasValues;
        if (isEmpty && !includeEmpty) {
          continue;
        }

        const rowData = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          // Handle different cell types
          let value = cell.value;

          // Handle formula cells
          if (cell.formula) {
            value = cell.result || cell.formula;
          }

          // Handle dates
          if (value instanceof Date) {
            value = value.toISOString();
          }

          // Handle rich text
          if (value && typeof value === 'object' && value.richText) {
            value = value.richText.map(t => t.text).join('');
          }

          rowData[colNumber - 1] = value;
        });

        rows.push(rowData);
      }

      const metadata = {
        sheetCount: workbook.worksheets.length,
        sheetNames: workbook.worksheets.map(ws => ws.name),
        rowCount: rows.length,
        columnCount: headers.length,
        currentSheet: worksheet.name,
        hasFormulas: this._detectFormulas(worksheet),
      };

      logger.info(
        `[ExcelService] Parsed workbook: ${metadata.sheetCount} sheets, ${rows.length} rows`,
      );

      return { headers, rows, metadata };
    } catch (error) {
      logger.error('[ExcelService] Failed to parse workbook:', error);
      throw new Error(`Failed to parse Excel workbook: ${error.message}`);
    }
  }

  /**
   * Update an existing workbook
   * @param {Buffer} existingBuffer - Existing Excel file buffer
   * @param {Object} updates - Updates to apply
   * @param {string[]} [updates.headers] - New headers
   * @param {Array<Array<any>>} [updates.rows] - New rows
   * @param {string|number} [updates.sheetIndex=0] - Sheet to update
   * @returns {Promise<ExcelJS.Workbook>} Updated workbook
   */
  async updateWorkbook(existingBuffer, updates) {
    const { headers, rows, sheetIndex = 0 } = updates;

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(existingBuffer);

      const worksheet = typeof sheetIndex === 'number'
        ? workbook.worksheets[sheetIndex]
        : workbook.getWorksheet(sheetIndex);

      if (!worksheet) {
        throw new Error(`Worksheet ${sheetIndex} not found`);
      }

      // Clear existing data
      worksheet.spliceRows(1, worksheet.rowCount);

      // Add headers
      if (headers) {
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' },
        };
      }

      // Add rows
      if (rows) {
        rows.forEach((row) => {
          worksheet.addRow(row);
        });
      }

      workbook.modified = new Date();

      logger.info(`[ExcelService] Updated workbook sheet ${sheetIndex}`);

      return workbook;
    } catch (error) {
      logger.error('[ExcelService] Failed to update workbook:', error);
      throw new Error(`Failed to update Excel workbook: ${error.message}`);
    }
  }

  /**
   * Convert workbook to buffer
   * @param {ExcelJS.Workbook} workbook - Excel workbook
   * @returns {Promise<Buffer>} Excel file buffer
   */
  async toBuffer(workbook) {
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      logger.info(`[ExcelService] Converted workbook to buffer (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      logger.error('[ExcelService] Failed to convert workbook to buffer:', error);
      throw new Error(`Failed to convert workbook to buffer: ${error.message}`);
    }
  }

  /**
   * List all sheets in a workbook
   * @param {Buffer} buffer - Excel file buffer
   * @returns {Promise<Array<{name: string, rowCount: number, columnCount: number}>>}
   */
  async listSheets(buffer) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheets = workbook.worksheets.map((worksheet) => ({
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        index: worksheet.id - 1,
      }));

      logger.info(`[ExcelService] Listed ${sheets.length} sheets`);

      return sheets;
    } catch (error) {
      logger.error('[ExcelService] Failed to list sheets:', error);
      throw new Error(`Failed to list workbook sheets: ${error.message}`);
    }
  }

  /**
   * Get data from a specific sheet
   * @param {Buffer} buffer - Excel file buffer
   * @param {string|number} sheetIdentifier - Sheet name or index
   * @returns {Promise<{headers: string[], rows: Array<Array<any>>}>}
   */
  async getSheetData(buffer, sheetIdentifier) {
    try {
      const result = await this.parseWorkbook(buffer, { sheetIndex: sheetIdentifier });
      return { headers: result.headers, rows: result.rows };
    } catch (error) {
      logger.error('[ExcelService] Failed to get sheet data:', error);
      throw new Error(`Failed to get sheet data: ${error.message}`);
    }
  }

  /**
   * Detect if worksheet contains formulas
   * @private
   * @param {ExcelJS.Worksheet} worksheet - Worksheet to check
   * @returns {boolean} True if formulas detected
   */
  _detectFormulas(worksheet) {
    let hasFormulas = false;
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          hasFormulas = true;
        }
      });
    });
    return hasFormulas;
  }

  /**
   * Validate Excel file structure
   * @param {Buffer} buffer - Excel file buffer
   * @returns {Promise<{valid: boolean, errors: string[]}>}
   */
  async validateWorkbook(buffer) {
    const errors = [];

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // Check if workbook has at least one worksheet
      if (workbook.worksheets.length === 0) {
        errors.push('Workbook has no worksheets');
      }

      // Check if first worksheet has data
      const firstSheet = workbook.worksheets[0];
      if (firstSheet && firstSheet.rowCount === 0) {
        errors.push('First worksheet is empty');
      }

      const valid = errors.length === 0;

      logger.info(`[ExcelService] Validated workbook: ${valid ? 'valid' : 'invalid'}`);

      return { valid, errors };
    } catch (error) {
      logger.error('[ExcelService] Validation error:', error);
      return {
        valid: false,
        errors: [`Invalid Excel file: ${error.message}`],
      };
    }
  }
}

module.exports = ExcelService;
