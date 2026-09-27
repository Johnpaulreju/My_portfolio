/**
 * A tiny synthesized shutter: two short filtered noise ticks, like a mirror
 * flipping up and back. No audio file, no network. Volume follows the Quick
 * Settings slider and it stays silent when the system is muted.
 */

type Ctor = typeof AudioContext

export function createShutterSound() {
  let ctx: AudioContext | null = null
  let noise: AudioBuffer | null = null
  let dead = false

  const ensure = () => {
    if (dead || typeof window === "undefined") return null
    if (ctx) return ctx
    const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
    if (!C) {
      dead = true
      return null
    }
    try {
      ctx = new C()
      const length = Math.floor(ctx.sampleRate * 0.05)
      noise = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
      return ctx
    } catch {
      dead = true
      return null
    }
  }

  const tick = (audio: AudioContext, at: number, gain: number, freq: number) => {
    if (!noise) return
    const src = audio.createBufferSource()
    src.buffer = noise
    const band = audio.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = freq
    band.Q.value = 0.9
    const amp = audio.createGain()
    amp.gain.setValueAtTime(gain, at)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    src.connect(band)
    band.connect(amp)
    amp.connect(audio.destination)
    src.start(at)
    src.stop(at + 0.06)
  }

  return {
    /** Call from the shutter press so the browser allows the sound. */
    play(volume: number, muted: boolean) {
      if (muted || volume <= 0) return
      const audio = ensure()
      if (!audio) return
      if (audio.state === "suspended") audio.resume().catch(() => {})
      const level = Math.min(1, volume / 100) * 0.9
      const now = audio.currentTime + 0.005
      tick(audio, now, level, 3200)
      tick(audio, now + 0.075, level * 0.7, 2200)
    },
    dispose() {
      ctx?.close().catch(() => {})
      ctx = null
      noise = null
    },
  }
}
