const sharp = require("sharp");

function getBlock(level) {
  const value = Math.min(Math.max(Number(level) || 12, 1), 40);
  return 41 - value;
}

async function toPixel(buffer, level = 30) {
  try {
    const image = sharp(buffer, {
      limitInputPixels: false
    })
      .rotate()
      .ensureAlpha();

    const meta = await image.metadata();

    const width = meta.width;
    const height = meta.height;
    const block = getBlock(level);

    const input = await image.raw().toBuffer();
    const output = Buffer.alloc(input.length);

    for (let y = 0; y < height; y += block) {
      for (let x = 0; x < width; x += block) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;

        const maxY = Math.min(y + block, height);
        const maxX = Math.min(x + block, width);

        for (let yy = y; yy < maxY; yy++) {
          for (let xx = x; xx < maxX; xx++) {
            const i = (yy * width + xx) * 4;

            r += input[i];
            g += input[i + 1];
            b += input[i + 2];
            a += input[i + 3];

            count++;
          }
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        a = Math.round(a / count);

        for (let yy = y; yy < maxY; yy++) {
          for (let xx = x; xx < maxX; xx++) {
            const i = (yy * width + xx) * 4;

            output[i] = r;
            output[i + 1] = g;
            output[i + 2] = b;
            output[i + 3] = a;
          }
        }
      }
    }

    const result = await sharp(output, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: false
      })
      .toBuffer();

    return result;
  } catch (e) {
    throw new Error(e.message);
  }
}

module.exports = {
  toPixel
};