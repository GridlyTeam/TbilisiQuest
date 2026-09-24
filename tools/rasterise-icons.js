/**
 * Turn the icon SVGs into PNGs the app can use.
 *
 * react-native-svg would render them directly, but it is a native module, so
 * adding it costs a rebuild and takes the icons off the reload-in-a-second
 * workflow everything else here enjoys. Rasterising instead keeps the app free
 * of native dependencies.
 *
 * Three densities, because React Native picks name@2x/@3x automatically from a
 * single require of the 1x path. Drawn at full colour and never tinted: these
 * are illustrations with four or five colours each, and tintColor would
 * collapse them to one.
 *
 *   node tools/rasterise-icons.js <folder-with-svgs>
 */

const path = require('path')
const sharp = require(path.join(__dirname, '..', 'apps', 'mobile', 'node_modules', 'sharp'))

const OUT = path.join(__dirname, '..', 'apps', 'mobile', 'assets', 'icons')
const NAMES = ['map', 'voucher', 'season', 'store', 'info']

/** The logical size the icons are drawn at; @2x and @3x scale from it. */
const BASE = 26

async function main() {
  const src = process.argv[2]
  if (!src) {
    console.error('usage: node tools/rasterise-icons.js <folder-with-svgs>')
    process.exit(1)
  }

  for (const name of NAMES) {
    for (const density of [1, 2, 3]) {
      const suffix = density === 1 ? '' : `@${density}x`
      await sharp(path.join(src, `${name}.svg`), { density: 400 })
        .resize(BASE * density, BASE * density, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(OUT, `${name}${suffix}.png`))
    }
    console.log('rasterised', name)
  }
  // The character tab's icon is the mascot's own face, cropped from the
  // creature render by tools/crop-mascot-face.py rather than from an SVG.
}

main()
