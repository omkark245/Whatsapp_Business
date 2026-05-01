const fs = require('fs');
const path = require('path');
const {
  MAX_UPLOAD_BYTES,
  UPLOAD_DIR,
  ensureUploadDir,
  getUploadDefinition,
  sanitizeStoredFilename,
  validateUploadBuffer,
} = require('../utils/uploads');
const { AppError } = require('../utils/errors');

exports.uploadMedia = async (req, res) => {
  try {
    const { filename, mimeType, contentBase64 } = req.body;

    if (!filename || !mimeType || !contentBase64) {
      throw new AppError(400, 'UPLOAD_FIELDS_REQUIRED', 'filename, mimeType, and contentBase64 are required');
    }

    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) {
      throw new AppError(400, 'INVALID_UPLOAD_CONTENT', 'Invalid upload content');
    }

    const uploadDefinition = getUploadDefinition(filename, mimeType);
    if (!uploadDefinition) {
      throw new AppError(400, 'UNSUPPORTED_UPLOAD_TYPE', 'Unsupported upload type. Allowed types are images, videos, PDFs, Office files, text files, and CSV files.');
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new AppError(413, 'UPLOAD_TOO_LARGE', 'Uploaded file is too large. Keep it under 35 MB.');
    }

    if (!validateUploadBuffer(buffer, uploadDefinition)) {
      throw new AppError(400, 'INVALID_UPLOAD_CONTENT', 'Uploaded file content does not match the selected file type.');
    }

    ensureUploadDir();

    const storedName = sanitizeStoredFilename(filename, uploadDefinition.extension);
    const relativePath = `/uploads/${storedName}`;
    const absolutePath = path.join(UPLOAD_DIR, storedName);

    fs.writeFileSync(absolutePath, buffer);

    const baseUrl = process.env.PUBLIC_API_BASE_URL || `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      filename,
      storedName,
      mimeType: uploadDefinition.mimeType,
      kind: uploadDefinition.kind,
      size: buffer.length,
      url: `${baseUrl}${relativePath}`,
      path: relativePath,
    });
  } catch (error) {
    throw error;
  }
};
