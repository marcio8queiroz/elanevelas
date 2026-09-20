import sharp from 'sharp';
import AppError from '../utils/AppError.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 8192;

function detectedFormat(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new AppError('Formato de imagem não suportado.', 415);
}

// libvips reads APNG's first frame on some builds. Reject the animation chunk explicitly.
function rejectAnimatedPng(buffer) {
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'acTL') {
      throw new AppError('Imagens animadas não são permitidas.', 415);
    }
    offset += size + 12;
  }
}

export async function processImage(file) {
  if (!file?.buffer?.length) throw new AppError('Envie um arquivo no campo file.', 400);
  if (file.buffer.length > MAX_IMAGE_BYTES) throw new AppError('Imagem excede 5 MiB.', 413);
  const format = detectedFormat(file.buffer);
  if (file.mimetype !== `image/${format}`) throw new AppError('MIME incompatível com o conteúdo.', 415);
  // The filename is deliberately ignored, including its extension.
  if (format === 'png') rejectAnimatedPng(file.buffer);
  try {
    const image = sharp(file.buffer, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== format) throw new AppError('Formato incompatível.', 415);
    if ((metadata.pages ?? 1) !== 1) throw new AppError('Imagens animadas não são permitidas.', 415);
    if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION ||
        metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new AppError('Dimensões da imagem excedem o limite.', 400);
    }
    const { data, info } = await image.rotate().webp({ quality: 85 }).timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES) throw new AppError('Imagem processada excede 5 MiB.', 413);
    return { buffer: data, width: info.width, height: info.height, format: 'webp', bytes: data.length };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Imagem corrompida ou fora dos limites de decodificação.', 400);
  }
}
