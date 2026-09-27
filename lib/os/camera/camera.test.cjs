// Camera helpers: errors, names, crop maths, colour replay, gallery cap. Run: node --test lib/os/camera/camera.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports)
  return loaded.exports
}

const media = load('media.ts')
const filters = load('filters.ts')
const gallery = load('gallery.ts')

test('photo names follow jp-camera-YYYYMMDD-HHMMSS.jpg in local time', () => {
  assert.equal(media.photoName(new Date(2026, 8, 7, 9, 5, 3)), 'jp-camera-20260907-090503.jpg')
  assert.equal(media.photoName(new Date(2026, 11, 31, 23, 59, 59)), 'jp-camera-20261231-235959.jpg')
})

test('browser errors map to the fix the visitor needs', () => {
  const err = (name) => ({ name })
  assert.equal(media.classifyError(err('NotAllowedError')), 'denied')
  assert.equal(media.classifyError(err('SecurityError')), 'denied')
  assert.equal(media.classifyError(err('NotFoundError')), 'no-camera')
  assert.equal(media.classifyError(err('OverconstrainedError')), 'no-camera')
  assert.equal(media.classifyError(err('NotReadableError')), 'busy')
  assert.equal(media.classifyError(err('TypeError')), 'unsupported')
  assert.equal(media.classifyError(err('TypeError'), 'Mozilla/5.0 Instagram 300.0'), 'in-app')
  assert.equal(media.classifyError('nonsense'), 'unsupported')
})

test('problems visible before asking never trigger a prompt', () => {
  const ua = 'Mozilla/5.0 Chrome/140'
  assert.equal(media.supportProblem({ secure: false, hasGetUserMedia: true, ua }), 'insecure')
  assert.equal(media.supportProblem({ secure: true, hasGetUserMedia: false, ua }), 'unsupported')
  assert.equal(media.supportProblem({ secure: true, hasGetUserMedia: false, ua: 'FBAN/FBIOS' }), 'in-app')
  assert.equal(media.supportProblem({ secure: true, hasGetUserMedia: true, ua }), null)
})

test('constraints ask for 720p, no audio, by facing or by device', () => {
  const byFacing = media.cameraConstraints('user')
  assert.equal(byFacing.audio, false)
  assert.deepEqual(byFacing.video, { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } })
  const byDevice = media.cameraConstraints('user', 'abc')
  assert.deepEqual(byDevice.video.deviceId, { exact: 'abc' })
  assert.equal(byDevice.video.facingMode, undefined)
})

test('front cameras mirror, back cameras and patterns do not', () => {
  assert.equal(media.shouldMirror('user', undefined), true)
  assert.equal(media.shouldMirror('environment', undefined), false)
  assert.equal(media.shouldMirror('user', 'environment'), false)
  assert.equal(media.shouldMirror('environment', 'user'), true)
})

test('stopStream ends every track', () => {
  const tracks = [{ stopped: false, stop() { this.stopped = true } }, { stopped: false, stop() { this.stopped = true } }]
  media.stopStream({ getTracks: () => tracks })
  assert.ok(tracks.every((t) => t.stopped))
  media.stopStream(null)
})

test('cover crop matches object-fit: cover', () => {
  // 16:9 source in a portrait view: full height, centred slice of the width.
  assert.deepEqual(filters.coverCrop(1280, 720, 390, 600), { sx: 406, sy: 0, sw: 468, sh: 720 })
  // Same aspect: the whole frame.
  assert.deepEqual(filters.coverCrop(1280, 720, 640, 360), { sx: 0, sy: 0, sw: 1280, sh: 720 })
  // Wider view: full width, centred slice of the height.
  const c = filters.coverCrop(1280, 720, 800, 200)
  assert.equal(c.sw, 1280)
  assert.equal(c.sh, 320)
  assert.equal(c.sy, 200)
})

test('css filter strings and the per-pixel replay agree on the basics', () => {
  assert.equal(filters.cssFilter([]), 'none')
  assert.equal(filters.cssFilter(filters.filterById('mono').ops), 'grayscale(1) contrast(1.1)')
  const px = new Uint8ClampedArray([255, 0, 0, 255, 10, 200, 30, 255])
  filters.applyColorOps(px, [{ op: 'grayscale', amount: 1 }])
  assert.equal(px[0], px[1])
  assert.equal(px[1], px[2])
  assert.equal(px[3], 255, 'alpha untouched')
  assert.equal(px[4], px[5])
  assert.equal(filters.filterById('nope').id, 'normal')
})

test('the gallery keeps the newest 24 and hands back what fell off', () => {
  let photos = []
  const dropped = []
  for (let i = 0; i < 26; i++) {
    const r = gallery.addPhoto(photos, { id: String(i), name: `p${i}` })
    photos = r.photos
    dropped.push(...r.dropped)
  }
  assert.equal(photos.length, gallery.GALLERY_CAP)
  assert.equal(photos[0].id, '25')
  assert.deepEqual(dropped.map((p) => p.id), ['0', '1'])
  const r = gallery.removePhoto(photos, '20')
  assert.equal(r.photos.length, 23)
  assert.equal(r.removed.id, '20')
  assert.equal(r.index, 5)
  assert.equal(gallery.removePhoto(photos, 'missing').removed, null)
})

test('two shots in one second never share a file name', () => {
  const base = 'jp-camera-20260927-101010.jpg'
  assert.equal(gallery.uniqueName([], base), base)
  assert.equal(gallery.uniqueName([{ name: base }], base), 'jp-camera-20260927-101010-2.jpg')
  assert.equal(gallery.uniqueName([{ name: base }, { name: 'jp-camera-20260927-101010-2.jpg' }], base), 'jp-camera-20260927-101010-3.jpg')
})
