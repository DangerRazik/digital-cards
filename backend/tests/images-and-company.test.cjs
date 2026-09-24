const test = require('node:test');
const assert = require('node:assert/strict');
const { crc32, deflateSync } = require('node:zlib');
const { validatePngImage } = require('../src/images/png-image.ts');
const { toPublicCard } = require('../src/public-card.ts');

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}

function png(width = 1, extra = Buffer.alloc(0)) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', header),
    extra,
    chunk('IDAT', deflateSync(Buffer.from([0,255,0,0,255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('PNG: valid raster accepted and metadata stripped', () => {
  const clean = png();
  assert.deepEqual(validatePngImage(clean), clean);
  assert.deepEqual(validatePngImage(png(1, chunk('tEXt', Buffer.from('Private metadata')))), clean);
});

test('PNG: rejects SVG, bad CRC, oversized dimensions and appended data', () => {
  assert.throws(() => validatePngImage(Buffer.from('<svg></svg>')));
  const corrupted = png();
  corrupted[30] ^= 1;
  assert.throws(() => validatePngImage(corrupted));
  assert.throws(() => validatePngImage(png(2049)));
  assert.throws(() => validatePngImage(Buffer.concat([png(), Buffer.from('extra')])));
  assert.throws(() => validatePngImage(png().subarray(0, 45)));
});

test('Company fields and uploaded URLs retain server filtering', () => {
  const url = '/api/public/images/11111111-1111-1111-1111-111111111111.png';
  const snapshot = {
    blocks: { company: true, avatar: true, map: true, address: false },
    companyPhone: { value: '123', enabled: true },
    companyEmail: { value: 'private@example.test', enabled: false },
    companyWebsite: { value: 'javascript:alert(1)', enabled: true },
    companyAddress: { value: 'Company address', enabled: true },
    photo: { value: url, enabled: true },
  };
  const card = toPublicCard('test', snapshot);
  assert.equal(card.companyPhone.value, '123');
  assert.equal(card.companyEmail.value, '');
  assert.equal(card.companyWebsite.value, '');
  assert.equal(card.photo.value, url);
  assert.equal(card.blocks.map, true);
  snapshot.blocks.company = false;
  snapshot.blocks.avatar = false;
  const hidden = toPublicCard('test', snapshot);
  assert.equal(hidden.companyPhone.value, '');
  assert.equal(hidden.companyAddress.value, '');
  assert.equal(hidden.photo.value, '');
  assert.equal(hidden.blocks.map, false);
  assert.equal(toPublicCard('old', {}).companyPhone.enabled, false);
});
