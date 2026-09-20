import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage, MAX_IMAGE_PIXELS } from '../src/services/imageProcessing.service.js';

const generated = (width = 4, height = 3) => sharp({ create: { width, height, channels: 3, background: '#123456' } });
const file = (buffer, format = 'png') => ({ buffer, mimetype: `image/${format}`, originalname: 'unused' });

describe('decodificação real de imagens', () => {
  it('remove EXIF, GPS, ICC e normaliza orientação', async () => {
    const buffer = await generated(4, 3).withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: 'Private name' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1' } }).jpeg().toBuffer();
    expect((await sharp(buffer).metadata()).exif).toBeDefined();
    const result = await processImage(file(buffer, 'jpeg'));
    const metadata = await sharp(result.buffer).metadata();
    expect(result).toMatchObject({ width: 3, height: 4, format: 'webp' });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(result.buffer.includes(Buffer.from('Private name'))).toBe(false);
  });

  it.each([[8193, 1], [1, 8193], [4001, 4000]])('limita dimensões/pixels %s × %s', async (width, height) => {
    const buffer = await generated(width, height).png().toBuffer();
    expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
    await expect(processImage(file(buffer))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita exatamente o limite dimensional', async () => {
    const result = await processImage(file(await generated(8192, 1).png().toBuffer()));
    expect(result.width).toBe(8192);
    expect(MAX_IMAGE_PIXELS).toBe(16_000_000);
  });

  it.each(['gif', 'webp'])('rejeita %s animado gerado localmente', async (format) => {
    const buffer = await sharp(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]),
      { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .toFormat(format, { loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(buffer).metadata()).pages).toBe(2);
    await expect(processImage(file(buffer, format))).rejects.toMatchObject({ statusCode: 415 });
  });

  it('rejeita GIF estático', async () => {
    await expect(processImage(file(await generated().gif().toBuffer(), 'gif'))).rejects.toMatchObject({ statusCode: 415 });
  });

  it('rejeita APNG mesmo quando o decoder só lê o primeiro frame', async () => {
    const png = await generated().png().toBuffer();
    // Insert an acTL chunk after IHDR; the parser rejects the animation marker before decoding.
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8, 0);
    chunk.write('acTL', 4);
    chunk.writeUInt32BE(2, 8);
    await expect(processImage(file(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]))))
      .rejects.toMatchObject({ statusCode: 415 });
  });

  it.each(['jpeg', 'png', 'webp'])('rejeita %s truncado durante a decodificação', async (format) => {
    const buffer = await generated(30, 20).toFormat(format).toBuffer();
    await expect(processImage(file(buffer.subarray(0, Math.floor(buffer.length / 2)), format)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['svg', 'pdf', 'mp4', 'html'])('rejeita conteúdo %s com MIME e extensão de imagem', async (type) => {
    const contents = { svg: '<svg/>', pdf: '%PDF-1.7', mp4: '\u0000\u0000\u0000\u0018ftypmp42', html: '<html>test</html>' };
    await expect(processImage(file(Buffer.from(contents[type])))).rejects.toMatchObject({ statusCode: 415 });
  });
});
