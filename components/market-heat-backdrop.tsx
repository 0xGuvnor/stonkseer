"use client"

import { useQuery } from "convex/react"
import { useEffect, useRef } from "react"

import { api } from "@/convex/_generated/api"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { computeMarketHeat } from "@/lib/market-heat"
import { FALLBACK_MARKET_TAPE } from "@/lib/market-tape-config"
import { cn } from "@/lib/utils"

const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_market;
uniform vec3 u_bg;
uniform vec3 u_mint;
uniform vec3 u_coral;
uniform float u_gain;
float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res.xy;
  vec2 asp=vec2(u_res.x/u_res.y,1.0);
  vec2 p=uv*asp*3.0;
  float t=u_time*0.06;
  float f=fbm(p+vec2(t,-t*0.4));
  f=fbm(p+f);
  float intensity=smoothstep(0.25,0.9,f)*0.55;
  float d=distance(uv,vec2(0.5,0.42));
  intensity*=smoothstep(0.95,0.1,d);
  float m=clamp(u_market*0.5+0.5,0.0,1.0);
  vec3 tone=mix(u_coral,u_mint,m);
  vec3 col=u_bg+(tone-u_bg)*intensity*u_gain;
  gl_FragColor=vec4(col,1.0);
}
`

const STATIC_TIME = 2.4
const MAX_DPR = 1.5

let colorParseCanvas: HTMLCanvasElement | null = null

function parseCssColorToRgb(value: string): [number, number, number] {
  if (!colorParseCanvas) {
    colorParseCanvas = document.createElement("canvas")
    colorParseCanvas.width = 1
    colorParseCanvas.height = 1
  }
  const ctx = colorParseCanvas.getContext("2d")
  if (!ctx) return [0, 0, 0]
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

type ThemeColors = {
  bg: [number, number, number]
  mint: [number, number, number]
  coral: [number, number, number]
}

const DEFAULT_THEME_COLORS: ThemeColors = {
  bg: [0.08, 0.08, 0.09],
  mint: [0.55, 0.85, 0.7],
  coral: [0.85, 0.45, 0.42],
}

const DARK_GAIN = 0.6
const LIGHT_GAIN = 0.22

function readThemeState(): { colors: ThemeColors; gain: number } {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  return {
    colors: {
      bg: parseCssColorToRgb(styles.getPropertyValue("--background").trim()),
      mint: parseCssColorToRgb(styles.getPropertyValue("--primary").trim()),
      coral: parseCssColorToRgb(styles.getPropertyValue("--down").trim()),
    },
    gain: root.classList.contains("dark") ? DARK_GAIN : LIGHT_GAIN,
  }
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  return program
}

type UniformLocations = {
  time: WebGLUniformLocation | null
  res: WebGLUniformLocation | null
  market: WebGLUniformLocation | null
  bg: WebGLUniformLocation | null
  mint: WebGLUniformLocation | null
  coral: WebGLUniformLocation | null
  gain: WebGLUniformLocation | null
}

function getUniformLocations(
  gl: WebGLRenderingContext,
  program: WebGLProgram
): UniformLocations {
  return {
    time: gl.getUniformLocation(program, "u_time"),
    res: gl.getUniformLocation(program, "u_res"),
    market: gl.getUniformLocation(program, "u_market"),
    bg: gl.getUniformLocation(program, "u_bg"),
    mint: gl.getUniformLocation(program, "u_mint"),
    coral: gl.getUniformLocation(program, "u_coral"),
    gain: gl.getUniformLocation(program, "u_gain"),
  }
}

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return { width, height }
}

export function useMarketHeat(): number {
  const snapshot = useQuery(api.marketTape.getSnapshot, {})
  const items = snapshot?.items ?? FALLBACK_MARKET_TAPE
  return computeMarketHeat(items)
}

type MarketHeatBackdropProps = {
  className?: string
}

export function MarketHeatBackdrop({ className }: MarketHeatBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetMarket = useMarketHeat()
  const targetMarketRef = useRef(targetMarket)

  const prefersReducedMotion = usePrefersReducedMotion()
  const prefersReducedMotionRef = useRef(prefersReducedMotion)

  const colorsRef = useRef<ThemeColors>(DEFAULT_THEME_COLORS)
  const gainRef = useRef(DARK_GAIN)
  const displayedMarketRef = useRef(targetMarket)
  const renderFrameRef = useRef<(time: number, market: number) => void>(() => {})
  const syncRef = useRef<() => void>(() => {})

  useEffect(() => {
    targetMarketRef.current = targetMarket
    if (prefersReducedMotion) {
      renderFrameRef.current(STATIC_TIME, targetMarket)
    }
  }, [targetMarket, prefersReducedMotion])

  useEffect(() => {
    function syncTheme() {
      const next = readThemeState()
      colorsRef.current = next.colors
      gainRef.current = next.gain
      if (prefersReducedMotionRef.current) {
        renderFrameRef.current(STATIC_TIME, targetMarketRef.current)
      }
    }

    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    })
    if (!gl) return

    const program = createProgram(gl)
    if (!program) return

    gl.useProgram(program)

    const buffer = gl.createBuffer()
    if (!buffer) return

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )

    const posLoc = gl.getAttribLocation(program, "a_pos")
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const uniforms = getUniformLocations(gl, program)
    const canvasEl = canvas

    displayedMarketRef.current = targetMarketRef.current
    const initialTheme = readThemeState()
    colorsRef.current = initialTheme.colors
    gainRef.current = initialTheme.gain

    const startTime = performance.now()
    let pausedAccum = 0
    let pauseStart: number | null = null
    let frameId = 0

    function getElapsedSeconds(): number {
      let paused = pausedAccum
      if (pauseStart !== null) {
        paused += performance.now() - pauseStart
      }
      return (performance.now() - startTime - paused) / 1000
    }

    function drawFrame(time: number, market: number) {
      if (!gl || gl.isContextLost()) return

      const { width, height } = resizeCanvas(canvasEl)
      gl.viewport(0, 0, width, height)

      const colors = colorsRef.current

      if (uniforms.time) gl.uniform1f(uniforms.time, time)
      if (uniforms.res) gl.uniform2f(uniforms.res, width, height)
      if (uniforms.market) gl.uniform1f(uniforms.market, market)
      if (uniforms.bg) gl.uniform3f(uniforms.bg, ...colors.bg)
      if (uniforms.mint) gl.uniform3f(uniforms.mint, ...colors.mint)
      if (uniforms.coral) gl.uniform3f(uniforms.coral, ...colors.coral)
      if (uniforms.gain) gl.uniform1f(uniforms.gain, gainRef.current)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    renderFrameRef.current = drawFrame

    function tick() {
      displayedMarketRef.current +=
        (targetMarketRef.current - displayedMarketRef.current) * 0.04
      drawFrame(getElapsedSeconds(), displayedMarketRef.current)
      frameId = requestAnimationFrame(tick)
    }

    function stop() {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId)
        frameId = 0
      }
    }

    function sync() {
      if (prefersReducedMotionRef.current) {
        stop()
        drawFrame(STATIC_TIME, targetMarketRef.current)
        return
      }
      if (!document.hidden && frameId === 0) {
        frameId = requestAnimationFrame(tick)
      }
    }

    syncRef.current = sync

    function onVisibilityChange() {
      if (document.hidden) {
        stop()
        if (pauseStart === null) {
          pauseStart = performance.now()
        }
        return
      }

      if (pauseStart !== null) {
        pausedAccum += performance.now() - pauseStart
        pauseStart = null
      }
      sync()
    }

    const resizeObserver = new ResizeObserver(() => {
      if (prefersReducedMotionRef.current) {
        drawFrame(STATIC_TIME, targetMarketRef.current)
      }
    })
    resizeObserver.observe(canvasEl)

    document.addEventListener("visibilitychange", onVisibilityChange)

    sync()

    return () => {
      stop()
      resizeObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      syncRef.current = () => {}
      renderFrameRef.current = () => {}
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion
    syncRef.current()
  }, [prefersReducedMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
    />
  )
}
