import { BadRequestException } from '@nestjs/common';
import { crc32, inflateSync } from 'node:zlib';

export function validatePngImage(buffer: Buffer): Buffer {
  const invalid = () => new BadRequestException('Не удалось прочитать изображение. Выберите другой файл.');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (buffer.length > 5 * 1024 * 1024 || !buffer.subarray(0, 8).equals(signature)) {
    throw invalid();
  }

  const chunks: Buffer[] = [signature];
  const imageData: Buffer[] = [];
  let offset = 8;
  let rowSize = 0;
  let height = 0;
  let finished = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + length + 12;
    const type = buffer.toString('ascii', offset + 4, offset + 8);

    if (end > buffer.length) {
      throw invalid();
    }

    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) {
      throw invalid();
    }

    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) {
        throw invalid();
      }
      const width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      const depth = buffer[offset + 16];
      const color = buffer[offset + 17];
      if (!width || !height || width > 2048 || height > 2048 || depth !== 8 || ![2, 6].includes(color)) {
        throw invalid();
      }
      if (buffer[offset + 18] || buffer[offset + 19] || buffer[offset + 20]) {
        throw invalid();
      }
      rowSize = width * (color === 6 ? 4 : 3) + 1;
      chunks.push(buffer.subarray(offset, end));
    } else if (type === 'IDAT') {
      imageData.push(buffer.subarray(offset + 8, end - 4));
      chunks.push(buffer.subarray(offset, end));
    } else if (type === 'IEND') {
      if (length !== 0 || imageData.length === 0 || end !== buffer.length) {
        throw invalid();
      }
      chunks.push(buffer.subarray(offset, end));
      finished = true;
      break;
    } else if (type[0] === type[0].toUpperCase()) {
      throw invalid();
    }
    offset = end;
  }

  if (!finished) {
    throw invalid();
  }

  try {
    const pixels = inflateSync(Buffer.concat(imageData), { maxOutputLength: rowSize * height });
    if (pixels.length !== rowSize * height) {
      throw invalid();
    }
    for (let row = 0; row < height; row += 1) {
      if (pixels[row * rowSize] > 4) {
        throw invalid();
      }
    }
  } catch {
    throw invalid();
  }

  // Не сохраняем метаданные и дополнительные вложения из загруженного PNG.
  return Buffer.concat(chunks);
}
