/** Convert the approved black-matted light artwork to straight RGBA.
 * On black, alpha compositing reconstructs the source RGB (within one byte).
 * On other themes, black becomes transparent rather than a rectangular tile.
 * This is decorative texture processing, never market/color/freshness truth.
 */
export function removeGlassBlackMatte(rgba: Uint8ClampedArray): void {
  if (rgba.length % 4 !== 0) throw new Error('Invalid RGBA buffer');
  for (let i = 0; i < rgba.length; i += 4) {
    const peak = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    const originalAlpha = rgba[i + 3];
    if (peak === 0 || originalAlpha === 0) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
    } else {
      rgba[i] = Math.round(rgba[i] * 255 / peak);
      rgba[i + 1] = Math.round(rgba[i + 1] * 255 / peak);
      rgba[i + 2] = Math.round(rgba[i + 2] * 255 / peak);
      rgba[i + 3] = Math.round(originalAlpha * peak / 255);
    }
  }
}
