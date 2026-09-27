// Alarm, timer and stopwatch rules. Run: node --test lib/os/clock-store.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function load() {
  const storage = new Map()
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  }
  const source = fs.readFileSync(path.join(__dirname, 'clock-store.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'localStorage', code)(require, loaded, loaded.exports, localStorage)
  return { ...loaded.exports, storage }
}

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime() // September 2026; the 26th is a Saturday
const alarm = (over = {}) => ({ id: 'a', hour: 7, minute: 0, label: '', enabled: true, days: [], armedAt: at(26, 10), snoozeUntil: null, ...over })

test('a weekday alarm skips the weekend', () => {
  const { nextOccurrence } = load()
  assert.equal(nextOccurrence(alarm({ days: [1, 2, 3, 4, 5] }), at(26, 10)), at(28, 7))
  assert.equal(nextOccurrence(alarm({ days: [1, 2, 3, 4, 5] }), at(28, 6, 59)), at(28, 7))
  assert.equal(nextOccurrence(alarm({ days: [1, 2, 3, 4, 5] }), at(28, 7)), at(29, 7), 'strictly after, so one slot never rings twice')
})

test('a one-time alarm has exactly one slot, then nothing', () => {
  const { nextOccurrence } = load()
  const once = alarm({ armedAt: at(26, 23) })
  assert.equal(nextOccurrence(once, at(26, 23, 30)), at(27, 7))
  assert.equal(nextOccurrence(once, at(27, 7)), null)
  assert.equal(nextOccurrence({ ...once, enabled: false }, at(26, 23, 30)), null)
})

test('a snooze rings before the next regular slot', () => {
  const { nextOccurrence, nextAlarm } = load()
  const daily = alarm({ days: [0, 1, 2, 3, 4, 5, 6], snoozeUntil: at(27, 7, 10) })
  assert.equal(nextOccurrence(daily, at(27, 7, 1)), at(27, 7, 10))
  assert.equal(nextOccurrence(daily, at(27, 7, 10)), at(28, 7), 'an old snooze is ignored')
  const soon = alarm({ id: 'b', hour: 6, days: [0] })
  assert.deepEqual(nextAlarm([daily, soon], at(27, 7, 1)), { alarm: daily, at: at(27, 7, 10) })
  assert.equal(nextAlarm([], at(27, 7)), null)
})

test('due and missed alarms', () => {
  const { dueAlarms, missedAlarms } = load()
  const once = alarm({ armedAt: at(26, 23) })
  assert.deepEqual(dueAlarms([once], at(27, 6, 59), at(27, 7)).map((d) => d.at), [at(27, 7)])
  assert.deepEqual(dueAlarms([once], at(27, 7), at(27, 7, 1)), [])
  assert.deepEqual(missedAlarms([once], at(27, 6)), [])
  assert.deepEqual(missedAlarms([once], at(27, 9)).map((a) => a.id), ['a'])
  assert.deepEqual(missedAlarms([{ ...once, snoozeUntil: at(27, 9, 5) }], at(27, 9)), [])
})

test('phone-style countdown text', () => {
  const { alarmInText } = load()
  assert.equal(alarmInText((7 * 60 + 5) * 60_000), 'Alarm in 7 h 5 min')
  assert.equal(alarmInText(30_000), 'Alarm in 1 min')
  assert.equal(alarmInText(60 * 60_000), 'Alarm in 1 h')
  assert.equal(alarmInText((2 * 1440 + 3 * 60 + 9) * 60_000), 'Alarm in 2 d 3 h')
})

test('the store saves alarms, turns one-time alarms off after ringing, and snoozes', () => {
  const { useClockStore, storage, SNOOZE_MS } = load()
  const s = useClockStore.getState()
  s.hydrate()
  const late = s.addAlarm({ hour: 9, minute: 30, label: '  Stand-up  ', days: [5, 1, 1] })
  const early = useClockStore.getState().addAlarm({ hour: 6, minute: 45 })
  const { alarms } = useClockStore.getState()
  assert.deepEqual(alarms.map((a) => a.id), [early, late], 'sorted by time of day')
  assert.equal(alarms[1].label, 'Stand-up')
  assert.deepEqual(alarms[1].days, [1, 5])
  assert.equal(JSON.parse(storage.get('jp-os-clock-v1')).alarms.length, 2)

  useClockStore.getState().ring({ kind: 'alarm', alarmId: early, label: '', since: 1 })
  assert.equal(useClockStore.getState().alarms[0].enabled, false)
  const before = Date.now()
  useClockStore.getState().snooze()
  const snoozed = useClockStore.getState().alarms[0]
  assert.equal(useClockStore.getState().ringing, null)
  assert.equal(snoozed.enabled, true)
  assert.ok(snoozed.snoozeUntil >= before + SNOOZE_MS)

  useClockStore.getState().updateAlarm(early, { label: 'Coffee' })
  assert.equal(useClockStore.getState().alarms[0].snoozeUntil, null, 'an edit cancels the snooze')
})

test('hydrate keeps valid saved data and drops anything malformed', () => {
  const first = load()
  first.storage.set('jp-os-clock-v1', JSON.stringify({
    alarms: [alarm(), { id: 'bad', hour: 25, minute: 0 }],
    timer: { duration: -1 },
    stopwatch: { startedAt: null, banked: 1200, laps: [400, 800] },
  }))
  first.useClockStore.getState().hydrate()
  const s = first.useClockStore.getState()
  assert.deepEqual(s.alarms.map((a) => a.id), ['a'])
  assert.equal(s.timer.duration, 5 * 60_000)
  assert.equal(s.stopwatch.banked, 1200)
})

test('timer and stopwatch keep time across pauses', () => {
  const { timerLeft, stopwatchElapsed } = load()
  assert.equal(timerLeft({ duration: 60_000, endsAt: 10_000, remaining: 60_000 }, 4_000), 6_000)
  assert.equal(timerLeft({ duration: 60_000, endsAt: 10_000, remaining: 60_000 }, 12_000), 0)
  assert.equal(timerLeft({ duration: 60_000, endsAt: null, remaining: 42_000 }, 99_999), 42_000)
  assert.equal(stopwatchElapsed({ startedAt: 1_000, banked: 500, laps: [] }, 3_000), 2_500)
  assert.equal(stopwatchElapsed({ startedAt: null, banked: 500, laps: [] }, 3_000), 500)
})

test('repeat summaries read like a phone', () => {
  const { repeatSummary } = load()
  assert.equal(repeatSummary([]), 'Once')
  assert.equal(repeatSummary([0, 1, 2, 3, 4, 5, 6]), 'Every day')
  assert.equal(repeatSummary([5, 1, 2, 3, 4]), 'Weekdays')
  assert.equal(repeatSummary([6, 0]), 'Weekends')
  assert.equal(repeatSummary([3, 1, 1]), 'Mon, Wed')
})

test('a new alarm defaults to the next full hour, wrapping past midnight', () => {
  const { nextFullHour } = load()
  assert.deepEqual(nextFullHour(at(26, 10, 42)), { hour: 11, minute: 0 })
  assert.deepEqual(nextFullHour(at(26, 23, 5)), { hour: 0, minute: 0 })
})

test('timer keypad digits fill hh:mm:ss from the right', () => {
  const { digitsToMs, msToDigits, MAX_TIMER_MS } = load()
  assert.equal(digitsToMs(''), 0)
  assert.equal(digitsToMs('5'), 5_000)
  assert.equal(digitsToMs('130'), 90_000)
  assert.equal(digitsToMs('10000'), 3_600_000)
  assert.equal(digitsToMs('999999'), MAX_TIMER_MS, 'clamped to the longest timer')
  assert.equal(msToDigits(5 * 60_000), '500')
  assert.equal(msToDigits(25 * 60_000), '2500')
  assert.equal(msToDigits(3_600_000 + 1_000), '10001')
  assert.equal(digitsToMs(msToDigits(754_000)), 754_000, 'round trip')
})

test('lengths read the way people say them', () => {
  const { durationText } = load()
  assert.equal(durationText(5 * 60_000), '5 min')
  assert.equal(durationText(90_000), '1 min 30 s')
  assert.equal(durationText(45_000), '45 s')
  assert.equal(durationText(5_400_000), '1 h 30 min')
  assert.equal(durationText(3_600_000 + 5_000), '1 h')
  assert.equal(durationText(0), '0 s')
})

test('+1:00 adds a minute to a running or paused timer, and reset keeps the picked length', () => {
  const { useClockStore, timerLeft } = load()
  const s = useClockStore.getState()
  s.hydrate()
  s.setTimerDuration(5 * 60_000)
  useClockStore.getState().extendTimer(60_000)
  assert.equal(useClockStore.getState().timer.remaining, 6 * 60_000, 'paused: more time left')
  useClockStore.getState().startTimer()
  const before = Date.now()
  useClockStore.getState().extendTimer(60_000)
  const t = useClockStore.getState().timer
  assert.ok(t.endsAt >= before + 7 * 60_000 - 50 && t.endsAt <= Date.now() + 7 * 60_000)
  assert.ok(timerLeft(t, Date.now()) > 6 * 60_000)
  useClockStore.getState().resetTimer()
  assert.deepEqual(useClockStore.getState().timer, { duration: 5 * 60_000, endsAt: null, remaining: 5 * 60_000 })
})

test('a ringing timer snoozes for one more minute', () => {
  const { useClockStore } = load()
  const s = useClockStore.getState()
  s.hydrate()
  s.setTimerDuration(3 * 60_000)
  useClockStore.getState().ring({ kind: 'timer', label: '3 min timer', since: 1 })
  assert.equal(useClockStore.getState().timer.endsAt, null, 'ringing resets the timer')
  const before = Date.now()
  useClockStore.getState().snooze()
  const t = useClockStore.getState().timer
  assert.equal(useClockStore.getState().ringing, null)
  assert.ok(t.endsAt >= before + 60_000 && t.endsAt <= Date.now() + 60_000)
  assert.equal(t.duration, 3 * 60_000)
})
