import multer from 'multer';
import AppError from '../utils/AppError.js';
import { MAX_IMAGE_BYTES } from '../services/imageProcessing.service.js';

const parse = multer({
  storage: multer.memoryStorage(),
  // Busboy emits partsLimit when the counter reaches the limit, including the last part.
  // files + fields enforce two actual parts; the sentinel permits file + optional alt.
  limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1, fields: 1, fieldSize: 801, fieldNameSize: 32, parts: 3, headerPairs: 20 },
}).single('file');

// Bound buffered requests and decoders together; no unbounded queue or temporary files.
let activeUploads = 0;
export function imageUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next(new AppError('Use multipart/form-data.', 415));
  if (Number(req.get('content-length')) > MAX_IMAGE_BYTES + 16 * 1024) {
    return next(new AppError('Requisição excede o limite.', 413));
  }
  if (activeUploads >= 4) return next(new AppError('Processamento de imagens ocupado.', 503));
  activeUploads += 1;
  let released = false;
  const release = () => { if (!released) { released = true; activeUploads -= 1; } };
  res.once('finish', release);
  req.releaseImageUpload = release;
  res.once('close', () => { if (!req.imageProcessing) release(); });
  parse(req, res, (error) => {
    if (error) return next(new AppError('Multipart inválido ou acima dos limites.',
      ['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE'].includes(error.code) ? 413 : 400));
    if (!req.file) return next(new AppError('Envie um arquivo no campo file.', 400));
    return next();
  });
}
