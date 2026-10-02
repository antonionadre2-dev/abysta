import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normaliseDirectoryImage, DIRECTORY_IMAGE_MAX_BYTES } from '../lib/directory/image-processing.ts';
import { DIRECTORY_IMAGE_REQUEST_MAX_BYTES, validateDirectoryImageRequestHeaders } from '../lib/directory/image-request.ts';

test('PNG pixels decode, resize without distortion and become WebP', async () => {
  const source = await sharp({create:{width:2000,height:1000,channels:3,background:'#147f87'}}).png().toBuffer();
  const result = await normaliseDirectoryImage(source);
  assert.equal(result.width, 1600);
  assert.equal(result.height, 800);
  assert.equal((await sharp(result.bytes).metadata()).format, 'webp');
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.byteSize, result.bytes.length);
});
test('JPEG EXIF orientation is applied and EXIF metadata is stripped', async () => {
  const source = await sharp({create:{width:80,height:40,channels:3,background:'white'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const result = await normaliseDirectoryImage(source);
  assert.equal(result.width,40); assert.equal(result.height,80);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.exif,undefined); assert.equal(metadata.orientation,undefined);
});
test('small WebP and alpha transparency survive without enlargement', async () => {
  const source = await sharp({create:{width:12,height:20,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).webp().toBuffer();
  const result = await normaliseDirectoryImage(source);
  assert.equal(result.width,12); assert.equal(result.height,20);
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha,true);
});
test('empty, oversized, SVG and non-image bytes cannot be uploaded', async () => {
  for (const bytes of [Buffer.alloc(0),Buffer.alloc(DIRECTORY_IMAGE_MAX_BYTES+1),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),Buffer.from('not an image')]) {
    await assert.rejects(() => normaliseDirectoryImage(bytes));
  }
});
test('compressed images over the 25 megapixel decode limit fail', async () => {
  const source = await sharp({create:{width:5001,height:5000,channels:3,background:'white'}}).png().toBuffer();
  assert.ok(source.length < DIRECTORY_IMAGE_MAX_BYTES);
  await assert.rejects(() => normaliseDirectoryImage(source));
});
test('truncated encoded images fail instead of being partially accepted', async () => {
  const source = await sharp({create:{width:120,height:120,channels:3,background:'red'}}).jpeg().toBuffer();
  await assert.rejects(() => normaliseDirectoryImage(source.subarray(0,source.length-30)));
});

test('image endpoint accepts only bounded same-origin multipart requests', () => {
  const valid = new Headers({
    origin: 'http://localhost:3000',
    'content-type': 'multipart/form-data; boundary=abysta',
    'content-length': '1024',
  });
  assert.deepEqual(validateDirectoryImageRequestHeaders('http://localhost:3000/api/directory-images', valid), {ok:true});

  for (const [changes, status] of [
    [{origin:null}, 403],
    [{origin:'https://example.test'}, 403],
    [{'content-type':'application/json'}, 415],
    [{'content-length':null}, 413],
    [{'content-length':'not-a-number'}, 413],
    [{'content-length':'0'}, 413],
    [{'content-length':String(DIRECTORY_IMAGE_REQUEST_MAX_BYTES + 1)}, 413],
  ]) {
    const headers = new Headers(valid);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) headers.delete(name); else headers.set(name, value);
    }
    assert.equal(validateDirectoryImageRequestHeaders('http://localhost:3000/api/directory-images', headers).status, status);
  }
});
