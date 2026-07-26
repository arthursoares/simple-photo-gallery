import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderTemplate } from '../src/lib/caption.ts';

const CAPTION = '{title} · {date} · {caption}';
const EXIF = '{camera} · {focal} · {aperture} · {shutter} · ISO {iso}';

describe('renderTemplate', () => {
  it('fills tokens and keeps the separators', () => {
    assert.equal(
      renderTemplate(CAPTION, { title: 'Wien', date: 'Aug 02, 2025', caption: 'Late light' }),
      'Wien · Aug 02, 2025 · Late light'
    );
  });

  it('drops segments whose tokens all resolve empty, separator and all', () => {
    assert.equal(renderTemplate(CAPTION, { title: 'Wien' }), 'Wien');
    assert.equal(
      renderTemplate(EXIF, { camera: 'Leica M11', iso: '400' }),
      'Leica M11 · ISO 400'
    );
  });

  it('keeps a partially filled segment', () => {
    assert.equal(renderTemplate('ISO {iso} at {aperture}', { iso: '400' }), 'ISO 400 at');
  });

  it('keeps literal-only segments', () => {
    assert.equal(renderTemplate('shot on film · {camera}', {}), 'shot on film');
  });

  it('handles an empty template and unknown tokens', () => {
    assert.equal(renderTemplate('', { title: 'x' }), '');
    assert.equal(renderTemplate('{nope}', { title: 'x' }), '');
  });

  it('renders nothing when every token is empty', () => {
    assert.equal(renderTemplate(EXIF, {}), '');
  });
});
