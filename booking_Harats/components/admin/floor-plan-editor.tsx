"use client"

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, RotateCw } from "lucide-react"
import type {
  FloorPlanAnnotations,
  FloorPlanBar,
  FloorPlanExit,
  FloorPlanRoom,
  Table,
  TableLayout,
  TableShape,
} from "@/app/admin/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TableDraft = {
  name: string
  maxCapacity: string
  isActive: boolean
  canUnite: boolean
  uniteWithTableId: string
}

type ResizeHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

type FigureTarget =
  | { kind: "table"; id: number }
  | { kind: "room"; id: string }
  | { kind: "exit"; id: string }
  | { kind: "bar" }

type Interaction =
  | { kind: "pan"; target: FigureTarget; lastClientX: number; lastClientY: number }
  | {
      kind: "resize"
      target: FigureTarget
      handle: ResizeHandleId
      rotationDeg: number
      lastClientX: number
      lastClientY: number
      /** width / height at resize start; used with Ctrl + corner handles for proportional resize */
      aspect0: number
    }
  | {
      kind: "rotate"
      target: FigureTarget
      startRotation: number
      startAngleRad: number
      centerXN: number
      centerYN: number
    }

function clampLayout(layout: TableLayout): TableLayout {
  const w = Math.min(1, Math.max(0.02, layout.w))
  const h = Math.min(1, Math.max(0.02, layout.h))
  const x = Math.min(Math.max(0, layout.x), 1 - w)
  const y = Math.min(Math.max(0, layout.y), 1 - h)
  const rotation = ((layout.rotation % 360) + 360) % 360
  const shape = layout.shape ?? "rectangle"
  return { x, y, w, h, rotation, shape }
}

function clampRect(x: number, y: number, w: number, h: number) {
  const cw = Math.min(1, Math.max(0.02, w))
  const ch = Math.min(1, Math.max(0.02, h))
  const cx = Math.min(Math.max(0, x), 1 - cw)
  const cy = Math.min(Math.max(0, y), 1 - ch)
  return { x: cx, y: cy, w: cw, h: ch }
}

function clampRotation(r: number) {
  return ((r % 360) + 360) % 360
}

const ROTATION_SNAP_DEG = 45

function snapRotationToCardinals(deg: number) {
  return clampRotation(Math.round(deg / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG)
}

/** Label above the axis-aligned bbox (not rotated with the figure). */
function TopFigureLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-full left-1/2 z-[45] mb-1 max-w-[min(200px,280%)] -translate-x-1/2 truncate text-center text-[10px] font-medium leading-tight drop-shadow ${className ?? ""}`}
    >
      {children}
    </span>
  )
}

/** Rotate screen-space delta (canvas-normalized) into local figure axes (+y down); rotationDeg clockwise (CSS). */
function toLocalDelta(ddxn: number, ddyn: number, rotationDeg: number) {
  const t = (rotationDeg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const lx = ddxn * c + ddyn * s
  const ly = -ddxn * s + ddyn * c
  return { lx, ly }
}

function applyResizeHandle(
  handle: ResizeHandleId,
  r: { x: number; y: number; w: number; h: number },
  lx: number,
  ly: number
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = r
  const min = 0.02
  switch (handle) {
    case "e":
      w = Math.max(min, w + lx)
      break
    case "w":
      x += lx
      w = Math.max(min, w - lx)
      break
    case "n":
      y += ly
      h = Math.max(min, h - ly)
      break
    case "s":
      h = Math.max(min, h + ly)
      break
    case "nw":
      x += lx
      y += ly
      w = Math.max(min, w - lx)
      h = Math.max(min, h - ly)
      break
    case "ne":
      y += ly
      w = Math.max(min, w + lx)
      h = Math.max(min, h - ly)
      break
    case "sw":
      x += lx
      w = Math.max(min, w - lx)
      h = Math.max(min, h + ly)
      break
    case "se":
      w = Math.max(min, w + lx)
      h = Math.max(min, h + ly)
      break
    default:
      break
  }
  return clampRect(x, y, w, h)
}

function isCornerHandle(handle: ResizeHandleId): handle is "nw" | "ne" | "se" | "sw" {
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw"
}

/** Corner resize keeping width/height ratio `aspect` (= w/h); deltas are in local figure space. */
function applyResizeCornerProportional(
  handle: "nw" | "ne" | "se" | "sw",
  r: { x: number; y: number; w: number; h: number },
  lx: number,
  ly: number,
  aspect: number
): { x: number; y: number; w: number; h: number } {
  const min = 0.02
  let { x, y, w, h } = r

  if (handle === "se") {
    let wn = w + lx
    let hn = wn / aspect
    if (wn < min) {
      wn = min
      hn = wn / aspect
    }
    if (hn < min) {
      hn = min
      wn = hn * aspect
    }
    if (x + wn > 1) wn = 1 - x
    hn = wn / aspect
    if (y + hn > 1) {
      hn = 1 - y
      wn = hn * aspect
      if (wn < min) {
        wn = min
        hn = wn / aspect
      }
    }
    return clampRect(x, y, wn, hn)
  }

  if (handle === "nw") {
    const fx = x + w
    const fy = y + h
    let wn = w - lx
    let hn = wn / aspect
    if (wn < min) {
      wn = min
      hn = wn / aspect
    }
    if (hn < min) {
      hn = min
      wn = hn * aspect
    }
    let xn = fx - wn
    let yn = fy - hn
    if (xn < 0) {
      xn = 0
      wn = fx
      hn = wn / aspect
      yn = fy - hn
    }
    if (yn < 0) {
      yn = 0
      hn = fy
      wn = hn * aspect
      xn = fx - wn
    }
    return clampRect(xn, yn, wn, hn)
  }

  if (handle === "ne") {
    const fy = y + h
    let wn = w + lx
    let hn = wn / aspect
    if (wn < min) {
      wn = min
      hn = wn / aspect
    }
    if (hn < min) {
      hn = min
      wn = hn * aspect
    }
    const xn = x
    let yn = fy - hn
    if (xn + wn > 1) {
      wn = 1 - xn
      hn = wn / aspect
      yn = fy - hn
    }
    if (yn < 0) {
      hn = fy
      wn = hn * aspect
      if (xn + wn > 1) wn = 1 - xn
      hn = wn / aspect
      yn = fy - hn
    }
    return clampRect(xn, yn, wn, hn)
  }

  // sw — opposite corner NE (x + w, y)
  const fx = x + w
  let wn = w - lx
  let hn = wn / aspect
  if (wn < min) {
    wn = min
    hn = wn / aspect
  }
  if (hn < min) {
    hn = min
    wn = hn * aspect
  }
  let xn = fx - wn
  const yn = y
  if (xn < 0) {
    xn = 0
    wn = fx
    hn = wn / aspect
  }
  if (yn + hn > 1) {
    hn = 1 - yn
    wn = hn * aspect
    xn = fx - wn
    if (xn < 0) {
      xn = 0
      wn = fx
      hn = wn / aspect
    }
  }
  return clampRect(xn, yn, wn, hn)
}

function tableDisplayRect(lay: TableLayout, shape: TableShape) {
  if (shape === "square" || shape === "circle") {
    const s = Math.min(lay.w, lay.h)
    const ox = lay.x + (lay.w - s) / 2
    const oy = lay.y + (lay.h - s) / 2
    return { left: ox, top: oy, w: s, h: s, rotation: lay.rotation }
  }
  return { left: lay.x, top: lay.y, w: lay.w, h: lay.h, rotation: lay.rotation }
}

function shapeVisualClass(shape: TableShape): string {
  if (shape === "circle") return "rounded-full"
  if (shape === "corner") return ""
  return "rounded-md"
}

function shapeClipPath(shape: TableShape): CSSProperties {
  if (shape === "corner") {
    return {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 38%, 38% 38%, 38% 100%, 0% 100%)",
    }
  }
  return {}
}

const HANDLE_POS: Record<ResizeHandleId, CSSProperties> = {
  nw: { left: 0, top: 0, transform: "translate(-50%, -50%)" },
  n: { left: "50%", top: 0, transform: "translate(-50%, -50%)" },
  ne: { left: "100%", top: 0, transform: "translate(-50%, -50%)" },
  e: { left: "100%", top: "50%", transform: "translate(-50%, -50%)" },
  se: { left: "100%", top: "100%", transform: "translate(-50%, -50%)" },
  s: { left: "50%", top: "100%", transform: "translate(-50%, -50%)" },
  sw: { left: 0, top: "100%", transform: "translate(-50%, -50%)" },
  w: { left: 0, top: "50%", transform: "translate(-50%, -50%)" },
}

const CURSOR: Record<ResizeHandleId, string> = {
  nw: "cursor-nwse-resize",
  n: "cursor-ns-resize",
  ne: "cursor-nesw-resize",
  e: "cursor-ew-resize",
  se: "cursor-nwse-resize",
  s: "cursor-ns-resize",
  sw: "cursor-nesw-resize",
  w: "cursor-ew-resize",
}

function ResizeRotateChrome({
  onResizePointerDown,
  onRotatePointerDown,
}: {
  onResizePointerDown: (e: React.PointerEvent, h: ResizeHandleId) => void
  onRotatePointerDown: (e: React.PointerEvent) => void
}) {
  const handles: ResizeHandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
  return (
    <div className="pointer-events-none absolute inset-0 z-[40]">
      <div className="pointer-events-none absolute inset-0 ring-2 ring-primary ring-offset-0" aria-hidden />
      {handles.map((h) => (
        <button
          key={h}
          type="button"
          className={`pointer-events-auto absolute h-3.5 w-3.5 rounded-full border-2 border-primary bg-background shadow ${CURSOR[h]}`}
          style={HANDLE_POS[h]}
          onPointerDown={(e) => onResizePointerDown(e, h)}
        />
      ))}
      <button
        type="button"
        className="pointer-events-auto absolute left-full top-1/2 z-10 ml-1 flex h-8 w-8 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-primary bg-background shadow active:cursor-grabbing"
        onPointerDown={onRotatePointerDown}
        title="Повернуть"
      >
        <RotateCw className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
      </button>
    </div>
  )
}

interface FloorPlanEditorProps {
  tables: Table[]
  tableDrafts: Record<number, TableDraft>
  updateTableDraft: (tableId: number, patch: Partial<TableDraft>) => void
  layoutDrafts: Record<number, TableLayout>
  setLayoutDrafts: Dispatch<SetStateAction<Record<number, TableLayout>>>
  shapeDrafts: Record<number, TableShape>
  setShapeDrafts: Dispatch<SetStateAction<Record<number, TableShape>>>
  planAnnotations: FloorPlanAnnotations
  setPlanAnnotations: Dispatch<SetStateAction<FloorPlanAnnotations>>
  floorPlanWidth: number
  floorPlanHeight: number
  onFloorPlanWidthChange: (v: number) => void
  onFloorPlanHeightChange: (v: number) => void
}

const SHAPE_OPTIONS: { value: TableShape; label: string }[] = [
  { value: "rectangle", label: "Прямоугольник" },
  { value: "square", label: "Квадрат" },
  { value: "circle", label: "Круг" },
  { value: "corner", label: "Угловой (L)" },
]

export function FloorPlanEditor({
  tables,
  tableDrafts,
  updateTableDraft,
  layoutDrafts,
  setLayoutDrafts,
  shapeDrafts,
  setShapeDrafts,
  planAnnotations,
  setPlanAnnotations,
  floorPlanWidth,
  floorPlanHeight,
  onFloorPlanWidthChange,
  onFloorPlanHeightChange,
}: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [selectionKey, setSelectionKey] = useState<string | null>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const sessionRef = useRef({ lastX: 0, lastY: 0 })
  const [workspaceOffset, setWorkspaceOffset] = useState({ x: 0, y: 0 })
  const [workspaceZoom, setWorkspaceZoom] = useState(1)
  const workspacePanRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  })

  const setInteractionSession = useCallback((next: Interaction | null) => {
    interactionRef.current = next
  }, [])

  const unplacedTables = useMemo(
    () => tables.filter((t) => layoutDrafts[t.id] == null),
    [tables, layoutDrafts]
  )
  const placedCount = tables.length - unplacedTables.length

  const patchLayout = useCallback(
    (tableId: number, patch: Partial<TableLayout>) => {
      setLayoutDrafts((prev) => {
        const cur = prev[tableId]
        if (!cur) return prev
        const shape = shapeDrafts[tableId] ?? cur.shape ?? "rectangle"
        return { ...prev, [tableId]: clampLayout({ ...cur, ...patch, shape }) }
      })
    },
    [setLayoutDrafts, shapeDrafts]
  )

  const setTableShape = useCallback(
    (tableId: number, shape: TableShape) => {
      setShapeDrafts((prev) => ({ ...prev, [tableId]: shape }))
      setLayoutDrafts((prev) => {
        const cur = prev[tableId]
        if (!cur) return prev
        return { ...prev, [tableId]: { ...cur, shape } }
      })
    },
    [setShapeDrafts, setLayoutDrafts]
  )

  const placeTableOnPlan = (tableId: number) => {
    const shape = shapeDrafts[tableId] ?? "rectangle"
    setLayoutDrafts((prev) => ({
      ...prev,
      [tableId]: clampLayout({
        x: 0.06 + (Object.keys(prev).length % 5) * 0.03,
        y: 0.06,
        w: shape === "circle" || shape === "square" ? 0.1 : 0.14,
        h: 0.09,
        rotation: 0,
        shape,
      }),
    }))
    setSelectionKey(`table:${tableId}`)
  }

  const removeTableFromPlan = (tableId: number) => {
    setLayoutDrafts((prev) => {
      const next = { ...prev }
      delete next[tableId]
      return next
    })
    setSelectionKey(null)
  }

  const patchRoom = useCallback(
    (id: string, patch: Partial<FloorPlanRoom>) => {
      setPlanAnnotations((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.id !== id) return r
          const merged = { ...r, ...patch }
          const { x, y, w, h } = clampRect(merged.x, merged.y, merged.w, merged.h)
          const rotation = patch.rotation !== undefined ? clampRotation(patch.rotation) : (r.rotation ?? 0)
          return { ...merged, x, y, w, h, rotation }
        }),
      }))
    },
    [setPlanAnnotations]
  )

  const patchExit = useCallback(
    (id: string, patch: Partial<FloorPlanExit>) => {
      setPlanAnnotations((prev) => ({
        ...prev,
        exits: prev.exits.map((ex) => {
          if (ex.id !== id) return ex
          const merged = { ...ex, ...patch }
          const { x, y, w, h } = clampRect(merged.x, merged.y, merged.w, merged.h)
          const rotation = patch.rotation !== undefined ? clampRotation(patch.rotation) : (ex.rotation ?? 0)
          return { ...merged, x, y, w, h, rotation }
        }),
      }))
    },
    [setPlanAnnotations]
  )

  const patchBar = useCallback(
    (patch: Partial<FloorPlanBar>) => {
      setPlanAnnotations((prev) => {
        if (!prev.bar) return prev
        const b = { ...prev.bar, ...patch }
        const { x, y, w, h } = clampRect(b.x, b.y, b.w, b.h)
        const rotation = patch.rotation !== undefined ? clampRotation(patch.rotation) : (prev.bar.rotation ?? 0)
        return {
          ...prev,
          bar: {
            ...b,
            x,
            y,
            w,
            h,
            rotation,
            label: b.label !== undefined ? String(b.label).slice(0, 80) : prev.bar.label,
          },
        }
      })
    },
    [setPlanAnnotations]
  )

  const captureCanvas = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const beginPan = useCallback(
    (e: React.PointerEvent, target: FigureTarget) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      captureCanvas(e)
      sessionRef.current = { lastX: e.clientX, lastY: e.clientY }
      const next: Interaction = {
        kind: "pan",
        target,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      }
      setInteractionSession(next)
    },
    [setInteractionSession]
  )

  const beginResize = useCallback(
    (
      e: React.PointerEvent,
      target: FigureTarget,
      handle: ResizeHandleId,
      rotationDeg: number,
      layoutW: number,
      layoutH: number
    ) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      captureCanvas(e)
      sessionRef.current = { lastX: e.clientX, lastY: e.clientY }
      const aspect0 = layoutW / Math.max(layoutH, 1e-6)
      setInteractionSession({
        kind: "resize",
        target,
        handle,
        rotationDeg,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        aspect0,
      })
    },
    [setInteractionSession]
  )

  const beginRotate = useCallback(
    (e: React.PointerEvent, target: FigureTarget, rotationDeg: number, centerXN: number, centerYN: number) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      captureCanvas(e)
      const canvas = canvasRef.current?.getBoundingClientRect()
      if (!canvas) return
      const cx = canvas.left + centerXN * canvas.width
      const cy = canvas.top + centerYN * canvas.height
      const startAngleRad = Math.atan2(e.clientY - cy, e.clientX - cx)
      setInteractionSession({
        kind: "rotate",
        target,
        startRotation: rotationDeg,
        startAngleRad,
        centerXN,
        centerYN,
      })
    },
    [setInteractionSession]
  )

  const onCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    const cur = interactionRef.current
    const canvas = canvasRef.current?.getBoundingClientRect()
    if (!cur || !canvas) return

    if (cur.kind === "pan") {
      const dx = (e.clientX - sessionRef.current.lastX) / canvas.width
      const dy = (e.clientY - sessionRef.current.lastY) / canvas.height
      sessionRef.current = { lastX: e.clientX, lastY: e.clientY }

      if (cur.target.kind === "table") {
        setLayoutDrafts((prev) => {
          const lay = prev[cur.target.id]
          if (!lay) return prev
          const shape = lay.shape ?? "rectangle"
          return {
            ...prev,
            [cur.target.id]: clampLayout({ ...lay, x: lay.x + dx, y: lay.y + dy, shape }),
          }
        })
      } else if (cur.target.kind === "room") {
        setPlanAnnotations((prev) => ({
          ...prev,
          rooms: prev.rooms.map((r) =>
            r.id === cur.target.id ? { ...r, x: r.x + dx, y: r.y + dy } : r
          ),
        }))
      } else if (cur.target.kind === "exit") {
        setPlanAnnotations((prev) => ({
          ...prev,
          exits: prev.exits.map((ex) =>
            ex.id === cur.target.id ? { ...ex, x: ex.x + dx, y: ex.y + dy } : ex
          ),
        }))
      } else if (cur.target.kind === "bar") {
        setPlanAnnotations((prev) => {
          if (!prev.bar) return prev
          const b = prev.bar
          return { ...prev, bar: { ...b, x: b.x + dx, y: b.y + dy } }
        })
      }
      return
    }

    if (cur.kind === "resize") {
      const ddxn = (e.clientX - sessionRef.current.lastX) / canvas.width
      const ddyn = (e.clientY - sessionRef.current.lastY) / canvas.height
      sessionRef.current = { lastX: e.clientX, lastY: e.clientY }
      const { lx, ly } = toLocalDelta(ddxn, ddyn, cur.rotationDeg)
      const useProportional = e.ctrlKey && isCornerHandle(cur.handle)

      if (cur.target.kind === "table") {
        setLayoutDrafts((prev) => {
          const lay = prev[cur.target.id]
          if (!lay) return prev
          const r0 = { x: lay.x, y: lay.y, w: lay.w, h: lay.h }
          const rect = useProportional
            ? applyResizeCornerProportional(cur.handle, r0, lx, ly, cur.aspect0)
            : applyResizeHandle(cur.handle, r0, lx, ly)
          const shape = lay.shape ?? "rectangle"
          return { ...prev, [cur.target.id]: clampLayout({ ...lay, ...rect, shape }) }
        })
      } else if (cur.target.kind === "room") {
        setPlanAnnotations((prev) => ({
          ...prev,
          rooms: prev.rooms.map((r) => {
            if (r.id !== cur.target.id) return r
            const r0 = { x: r.x, y: r.y, w: r.w, h: r.h }
            const rect = useProportional
              ? applyResizeCornerProportional(cur.handle, r0, lx, ly, cur.aspect0)
              : applyResizeHandle(cur.handle, r0, lx, ly)
            const { x, y, w, h } = clampRect(rect.x, rect.y, rect.w, rect.h)
            return { ...r, x, y, w, h, rotation: r.rotation ?? 0 }
          }),
        }))
      } else if (cur.target.kind === "exit") {
        setPlanAnnotations((prev) => ({
          ...prev,
          exits: prev.exits.map((ex) => {
            if (ex.id !== cur.target.id) return ex
            const r0 = { x: ex.x, y: ex.y, w: ex.w, h: ex.h }
            const rect = useProportional
              ? applyResizeCornerProportional(cur.handle, r0, lx, ly, cur.aspect0)
              : applyResizeHandle(cur.handle, r0, lx, ly)
            const { x, y, w, h } = clampRect(rect.x, rect.y, rect.w, rect.h)
            return { ...ex, x, y, w, h, rotation: ex.rotation ?? 0 }
          }),
        }))
      } else if (cur.target.kind === "bar") {
        setPlanAnnotations((prev) => {
          if (!prev.bar) return prev
          const b = prev.bar
          const r0 = { x: b.x, y: b.y, w: b.w, h: b.h }
          const rect = useProportional
            ? applyResizeCornerProportional(cur.handle, r0, lx, ly, cur.aspect0)
            : applyResizeHandle(cur.handle, r0, lx, ly)
          const { x, y, w, h } = clampRect(rect.x, rect.y, rect.w, rect.h)
          return { ...prev, bar: { ...b, x, y, w, h } }
        })
      }
      return
    }

    if (cur.kind === "rotate") {
      const cx = canvas.left + cur.centerXN * canvas.width
      const cy = canvas.top + cur.centerYN * canvas.height
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx)
      const deltaDeg = ((ang - cur.startAngleRad) * 180) / Math.PI
      const rawRot = clampRotation(cur.startRotation + deltaDeg)
      const nextRot = e.ctrlKey ? snapRotationToCardinals(rawRot) : rawRot

      if (cur.target.kind === "table") {
        setLayoutDrafts((prev) => {
          const lay = prev[cur.target.id]
          if (!lay) return prev
          const shape = lay.shape ?? "rectangle"
          return { ...prev, [cur.target.id]: clampLayout({ ...lay, rotation: nextRot, shape }) }
        })
      } else if (cur.target.kind === "room") {
        setPlanAnnotations((prev) => ({
          ...prev,
          rooms: prev.rooms.map((r) => (r.id === cur.target.id ? { ...r, rotation: nextRot } : r)),
        }))
      } else if (cur.target.kind === "exit") {
        setPlanAnnotations((prev) => ({
          ...prev,
          exits: prev.exits.map((ex) => (ex.id === cur.target.id ? { ...ex, rotation: nextRot } : ex)),
        }))
      } else if (cur.target.kind === "bar") {
        setPlanAnnotations((prev) => (prev.bar ? { ...prev, bar: { ...prev.bar, rotation: nextRot } } : prev))
      }
    }
  }, [])

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      setInteractionSession(null)
    },
    [setInteractionSession]
  )

  const addRoom = () => {
    const id = crypto.randomUUID()
    setPlanAnnotations((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { id, name: `Зал ${prev.rooms.length + 1}`, x: 0.05, y: 0.05, w: 0.42, h: 0.38, rotation: 0 }],
    }))
    setSelectionKey(`room:${id}`)
  }

  const addExit = () => {
    const id = crypto.randomUUID()
    setPlanAnnotations((prev) => ({
      ...prev,
      exits: [...prev.exits, { id, label: "Выход", x: 0.02, y: 0.35, w: 0.04, h: 0.18, rotation: 0 }],
    }))
    setSelectionKey(`exit:${id}`)
  }

  const addBar = () => {
    setPlanAnnotations((prev) =>
      prev.bar
        ? prev
        : {
            ...prev,
            bar: { x: 0.25, y: 0.78, w: 0.45, h: 0.1, label: "Бар", rotation: 0 },
          }
    )
    setSelectionKey("bar")
  }

  const removeRoom = (id: string) => {
    setPlanAnnotations((prev) => ({ ...prev, rooms: prev.rooms.filter((r) => r.id !== id) }))
    setSelectionKey(null)
  }

  const removeExit = (id: string) => {
    setPlanAnnotations((prev) => ({ ...prev, exits: prev.exits.filter((ex) => ex.id !== id) }))
    setSelectionKey(null)
  }

  const removeBar = () => {
    setPlanAnnotations((prev) => ({ ...prev, bar: null }))
    setSelectionKey(null)
  }

  const selectedTableId =
    selectionKey?.startsWith("table:") ? parseInt(selectionKey.slice(6), 10) : null
  const selected = selectedTableId != null ? tables.find((t) => t.id === selectedTableId) : null
  const selectedDraft = selectedTableId != null ? tableDrafts[selectedTableId] : null
  const selectedLayout = selectedTableId != null ? layoutDrafts[selectedTableId] : null
  const selectedShape = selectedTableId != null ? shapeDrafts[selectedTableId] ?? "rectangle" : "rectangle"

  const selectedRoom = selectionKey?.startsWith("room:")
    ? planAnnotations.rooms.find((r) => r.id === selectionKey.slice(5))
    : null
  const selectedExit = selectionKey?.startsWith("exit:")
    ? planAnnotations.exits.find((x) => x.id === selectionKey.slice(5))
    : null
  const barSelected = selectionKey === "bar" && planAnnotations.bar != null
  const navStep = 80

  const panWorkspaceBy = useCallback((dx: number, dy: number) => {
    setWorkspaceOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const resetWorkspaceView = useCallback(() => {
    setWorkspaceOffset({ x: 0, y: 0 })
    setWorkspaceZoom(1)
  }, [])

  const onWorkspacePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    workspacePanRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
    workspaceRef.current?.setPointerCapture(e.pointerId)
    setSelectionKey(null)
  }, [])

  const onWorkspacePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!workspacePanRef.current.dragging) return
    const dx = e.clientX - workspacePanRef.current.lastX
    const dy = e.clientY - workspacePanRef.current.lastY
    workspacePanRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
    panWorkspaceBy(dx, dy)
  }, [panWorkspaceBy])

  const onWorkspacePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!workspacePanRef.current.dragging) return
    workspacePanRef.current.dragging = false
    try {
      workspaceRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const onWorkspaceWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.altKey) return
    e.preventDefault()
    const dz = -e.deltaY * 0.0015
    setWorkspaceZoom((prev) => Math.min(2.4, Math.max(0.4, prev + dz)))
  }, [])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Название над фигурой по центру (горизонтально, не поворачивается). Перетаскивание тела — перемещение; маркеры по контуру — размер; круг справа — поворот. Удерживайте Ctrl: поворот кратен 45° (вертикаль, горизонталь, диагонали); за угловые маркеры — пропорциональное масштабирование.
        Неразмещённые столы — вкладка «Не на схеме».
      </p>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fp-w">Ширина схемы</Label>
          <Input
            id="fp-w"
            type="number"
            min={200}
            max={8000}
            value={floorPlanWidth}
            onChange={(e) => onFloorPlanWidthChange(parseInt(e.target.value, 10) || 200)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-h">Высота схемы</Label>
          <Input
            id="fp-h"
            type="number"
            min={200}
            max={8000}
            value={floorPlanHeight}
            onChange={(e) => onFloorPlanHeightChange(parseInt(e.target.value, 10) || 200)}
          />
        </div>
      </div>

      <Tabs defaultValue="canvas" className="w-full gap-3">
        <TabsList className="flex w-full flex-wrap h-auto">
          <TabsTrigger value="canvas" className="gap-1.5">
            Схема зала
            {placedCount > 0 ? (
              <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">{placedCount}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5">
            Не на схеме
            {unplacedTables.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {unplacedTables.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4 space-y-3">
          {unplacedTables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Все столы размещены на схеме или список пуст.</p>
          ) : (
            <ul className="space-y-2">
              {unplacedTables.map((t) => {
                const draft = tableDrafts[t.id]
                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium">{draft?.name ?? t.name}</div>
                      <div className="text-xs text-muted-foreground">до {draft?.maxCapacity ?? t.maxCapacity} мест</div>
                    </div>
                    <Button type="button" onClick={() => placeTableOnPlan(t.id)}>
                      Разместить на схеме
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="canvas" className="mt-3">
          <div className="relative h-[calc(100vh-290px)] min-h-[620px] overflow-hidden rounded-2xl border border-border bg-card/70">
            <div
              ref={workspaceRef}
              className="absolute inset-0 touch-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.45) 1px, transparent 1px)",
                backgroundSize: `${40 * workspaceZoom}px ${40 * workspaceZoom}px`,
                backgroundPosition: `${workspaceOffset.x}px ${workspaceOffset.y}px`,
              }}
              onPointerDown={onWorkspacePointerDown}
              onPointerMove={onWorkspacePointerMove}
              onPointerUp={onWorkspacePointerUp}
              onPointerCancel={onWorkspacePointerUp}
              onWheel={onWorkspaceWheel}
            >
              <div
                className="absolute left-1/2 top-1/2 w-[min(74vw,1200px)] max-w-[1200px]"
                style={{
                  transform: `translate(-50%, -50%) translate(${workspaceOffset.x}px, ${workspaceOffset.y}px) scale(${workspaceZoom})`,
                  transformOrigin: "center center",
                }}
              >
                <div
                  ref={canvasRef}
                  className="relative w-full touch-none overflow-visible rounded-xl border-2 border-dashed border-border bg-muted/30 shadow-sm"
                  style={{ aspectRatio: `${floorPlanWidth} / ${floorPlanHeight}` }}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerCancel={onCanvasPointerUp}
                  onPointerDown={() => setSelectionKey(null)}
                >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[length:10%_10%] opacity-40" />

              {planAnnotations.rooms.map((room) => {
                const rot = room.rotation ?? 0
                const sel = selectionKey === `room:${room.id}`
                const target: FigureTarget = { kind: "room", id: room.id }
                const cx = room.x + room.w / 2
                const cy = room.y + room.h / 2
                return (
                  <div
                    key={room.id}
                    className="absolute z-[5] pointer-events-auto"
                    style={{
                      left: `${room.x * 100}%`,
                      top: `${room.y * 100}%`,
                      width: `${room.w * 100}%`,
                      height: `${room.h * 100}%`,
                    }}
                  >
                    <TopFigureLabel className="text-sky-900 dark:text-sky-100">{room.name}</TopFigureLabel>
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `rotate(${rot}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <button
                        type="button"
                        className={`absolute inset-0 box-border border-2 border-dashed border-sky-500/60 bg-sky-500/10 ${
                          sel ? "ring-2 ring-sky-500" : ""
                        }`}
                        onPointerDown={(e) => {
                          setSelectionKey(`room:${room.id}`)
                          beginPan(e, target)
                        }}
                      />
                      {sel && (
                        <ResizeRotateChrome
                          onResizePointerDown={(e, h) => {
                            setSelectionKey(`room:${room.id}`)
                            beginResize(e, target, h, rot, room.w, room.h)
                          }}
                          onRotatePointerDown={(e) => {
                            setSelectionKey(`room:${room.id}`)
                            beginRotate(e, target, rot, cx, cy)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {planAnnotations.exits.map((ex) => {
                const rot = ex.rotation ?? 0
                const sel = selectionKey === `exit:${ex.id}`
                const target: FigureTarget = { kind: "exit", id: ex.id }
                const cx = ex.x + ex.w / 2
                const cy = ex.y + ex.h / 2
                return (
                  <div
                    key={ex.id}
                    className="absolute z-[8] pointer-events-auto"
                    style={{
                      left: `${ex.x * 100}%`,
                      top: `${ex.y * 100}%`,
                      width: `${ex.w * 100}%`,
                      height: `${ex.h * 100}%`,
                    }}
                  >
                    <TopFigureLabel className="text-[9px] font-semibold uppercase text-emerald-900 dark:text-emerald-50">
                      {ex.label || "Выход"}
                    </TopFigureLabel>
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `rotate(${rot}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <button
                        type="button"
                        className={`absolute inset-0 border-2 border-emerald-600 bg-emerald-500/25 ${
                          sel ? "ring-2 ring-emerald-500" : ""
                        }`}
                        onPointerDown={(e) => {
                          setSelectionKey(`exit:${ex.id}`)
                          beginPan(e, target)
                        }}
                      />
                      {sel && (
                        <ResizeRotateChrome
                          onResizePointerDown={(e, h) => {
                            setSelectionKey(`exit:${ex.id}`)
                            beginResize(e, target, h, rot, ex.w, ex.h)
                          }}
                          onRotatePointerDown={(e) => {
                            setSelectionKey(`exit:${ex.id}`)
                            beginRotate(e, target, rot, cx, cy)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {planAnnotations.bar ? (
                (() => {
                  const bar = planAnnotations.bar
                  const rot = bar.rotation ?? 0
                  const sel = selectionKey === "bar"
                  const target: FigureTarget = { kind: "bar" }
                  const cx = bar.x + bar.w / 2
                  const cy = bar.y + bar.h / 2
                  return (
                    <div
                      className="absolute z-[12] pointer-events-auto"
                      style={{
                        left: `${bar.x * 100}%`,
                        top: `${bar.y * 100}%`,
                        width: `${bar.w * 100}%`,
                        height: `${bar.h * 100}%`,
                      }}
                    >
                      <TopFigureLabel className="font-semibold text-amber-950 dark:text-amber-50">
                        {bar.label || "Бар"}
                      </TopFigureLabel>
                      <div
                        className="absolute inset-0"
                        style={{
                          transform: `rotate(${rot}deg)`,
                          transformOrigin: "center center",
                        }}
                      >
                        <button
                          type="button"
                          className={`absolute inset-0 border-2 border-amber-800 bg-amber-700/35 ${
                            sel ? "ring-2 ring-amber-500" : ""
                          }`}
                          onPointerDown={(e) => {
                            setSelectionKey("bar")
                            beginPan(e, target)
                          }}
                        />
                        {sel && (
                          <ResizeRotateChrome
                            onResizePointerDown={(e, h) => {
                              setSelectionKey("bar")
                              beginResize(e, target, h, rot, bar.w, bar.h)
                            }}
                            onRotatePointerDown={(e) => {
                              setSelectionKey("bar")
                              beginRotate(e, target, rot, cx, cy)
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })()
              ) : null}

                {tables.map((table) => {
                const lay = layoutDrafts[table.id]
                if (!lay) return null
                const draft = tableDrafts[table.id]
                const shape = shapeDrafts[table.id] ?? lay.shape ?? "rectangle"
                const box = tableDisplayRect(lay, shape)
                const sel = selectedTableId === table.id
                const target: FigureTarget = { kind: "table", id: table.id }
                const rot = lay.rotation
                const cx = lay.x + lay.w / 2
                const cy = lay.y + lay.h / 2
                const innerLeft = ((box.left - lay.x) / lay.w) * 100
                const innerTop = ((box.top - lay.y) / lay.h) * 100
                const innerW = (box.w / lay.w) * 100
                const innerH = (box.h / lay.h) * 100

                return (
                  <div
                    key={table.id}
                    className="absolute z-20 pointer-events-auto"
                    style={{
                      left: `${lay.x * 100}%`,
                      top: `${lay.y * 100}%`,
                      width: `${lay.w * 100}%`,
                      height: `${lay.h * 100}%`,
                    }}
                  >
                    <TopFigureLabel className="text-foreground sm:text-xs">
                      {draft?.name ?? table.name}
                    </TopFigureLabel>
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `rotate(${rot}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <button
                        type="button"
                        className={`absolute box-border flex flex-col items-center justify-center gap-0.5 border-2 p-1 text-center shadow-sm transition-colors pointer-events-auto ${shapeVisualClass(shape)} ${
                          sel ? "border-primary bg-primary/15" : "border-foreground/30 bg-card hover:bg-muted/80"
                        }`}
                        style={{
                          left: `${innerLeft}%`,
                          top: `${innerTop}%`,
                          width: `${innerW}%`,
                          height: `${innerH}%`,
                          ...shapeClipPath(shape),
                        }}
                        onPointerDown={(e) => {
                          setSelectionKey(`table:${table.id}`)
                          beginPan(e, target)
                        }}
                      >
                        <span className="shrink-0 text-[9px] text-muted-foreground sm:text-[10px]">
                          {draft ? `${draft.maxCapacity} мест` : `${table.maxCapacity} мест`}
                        </span>
                      </button>
                      {sel && (
                        <ResizeRotateChrome
                          onResizePointerDown={(e, h) => {
                            setSelectionKey(`table:${table.id}`)
                            beginResize(e, target, h, rot, lay.w, lay.h)
                          }}
                          onRotatePointerDown={(e) => {
                            setSelectionKey(`table:${table.id}`)
                            beginRotate(e, target, rot, cx, cy)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
                })}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute left-3 top-3 z-40 flex w-[64px] flex-col gap-2">
              <div className="pointer-events-auto rounded-xl border border-border bg-card/95 p-1.5 shadow">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => panWorkspaceBy(0, navStep)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => panWorkspaceBy(navStep, 0)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => panWorkspaceBy(-navStep, 0)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => panWorkspaceBy(0, -navStep)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="pointer-events-auto rounded-xl border border-border bg-card/95 p-1.5 shadow">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setWorkspaceZoom((z) => Math.min(2.4, z + 0.1))}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setWorkspaceZoom((z) => Math.max(0.4, z - 0.1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={resetWorkspaceView}>
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="pointer-events-auto rounded-xl border border-border bg-card/95 p-1 text-center text-[10px] text-muted-foreground shadow">
                {(workspaceZoom * 100).toFixed(0)}%
              </div>
            </div>

            <div className="pointer-events-none absolute left-3 bottom-3 z-40 w-[190px] rounded-xl border border-border bg-card/95 p-2 text-xs text-muted-foreground shadow">
              <div>Панорама: тяните пустой фон</div>
              <div>Zoom: Alt + колесо мыши</div>
              <div>Ctrl: snap/пропорции</div>
            </div>

            <div className="absolute right-3 top-3 z-40 w-[min(360px,calc(100%-86px))]">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card/95 p-2 shadow">
                <Button type="button" variant="secondary" size="sm" onClick={addRoom}>
                  + Зал
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={addExit}>
                  + Выход
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={addBar} disabled={planAnnotations.bar != null}>
                  + Бар
                </Button>
              </div>
            </div>

            <div className="absolute right-3 top-[88px] bottom-3 z-30 w-[min(360px,calc(100%-86px))] space-y-4 overflow-y-auto rounded-xl border border-border bg-card/95 p-4">
              <div className="text-sm font-medium">Выбор на схеме</div>

              {selected && selectedDraft && selectedLayout && (
                <>
                  <div className="space-y-2">
                    <Label>Форма стола</Label>
                    <Select value={selectedShape} onValueChange={(v) => setTableShape(selected.id, v as TableShape)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHAPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input
                      value={selectedDraft.name}
                      onChange={(e) => updateTableDraft(selected.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Вместимость</Label>
                    <Input
                      type="number"
                      min={1}
                      value={selectedDraft.maxCapacity}
                      onChange={(e) => updateTableDraft(selected.id, { maxCapacity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Активен</Label>
                    <div className="flex h-9 items-center">
                      <Switch
                        checked={selectedDraft.isActive}
                        onCheckedChange={(checked) => updateTableDraft(selected.id, { isActive: checked })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Объединить с</Label>
                    <div className="space-y-2">
                      <div className="flex h-9 items-center">
                        <Switch
                          checked={selectedDraft.canUnite}
                          onCheckedChange={(checked) =>
                            updateTableDraft(selected.id, {
                              canUnite: checked,
                              uniteWithTableId: checked ? selectedDraft.uniteWithTableId : "",
                            })
                          }
                        />
                      </div>
                      <Select
                        value={selectedDraft.uniteWithTableId || "none"}
                        onValueChange={(value) =>
                          updateTableDraft(selected.id, { uniteWithTableId: value === "none" ? "" : value })
                        }
                        disabled={!selectedDraft.canUnite}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите стол" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не задано</SelectItem>
                          {tables
                            .filter((c) => c.id !== selected.id)
                            .map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Положение (доли 0–1)</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">X</Label>
                        <Input
                          type="number"
                          step={0.01}
                          value={selectedLayout.x}
                          onChange={(e) => patchLayout(selected.id, { x: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Y</Label>
                        <Input
                          type="number"
                          step={0.01}
                          value={selectedLayout.y}
                          onChange={(e) => patchLayout(selected.id, { y: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ширина</Label>
                        <Input
                          type="number"
                          step={0.01}
                          value={selectedLayout.w}
                          onChange={(e) => patchLayout(selected.id, { w: parseFloat(e.target.value) || 0.02 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Высота</Label>
                        <Input
                          type="number"
                          step={0.01}
                          value={selectedLayout.h}
                          onChange={(e) => patchLayout(selected.id, { h: parseFloat(e.target.value) || 0.02 })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Поворот (°)</Label>
                        <Input
                          type="number"
                          step={1}
                          value={selectedLayout.rotation}
                          onChange={(e) => patchLayout(selected.id, { rotation: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="button" variant="outline" className="w-full" onClick={() => removeTableFromPlan(selected.id)}>
                    Снять со схемы
                  </Button>
                </>
              )}

              {!selected && selectedRoom && (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Зал</div>
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input
                      value={selectedRoom.name}
                      onChange={(e) => patchRoom(selectedRoom.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">X</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedRoom.x}
                        onChange={(e) => patchRoom(selectedRoom.id, { x: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Y</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedRoom.y}
                        onChange={(e) => patchRoom(selectedRoom.id, { y: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ширина</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedRoom.w}
                        onChange={(e) => patchRoom(selectedRoom.id, { w: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Высота</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedRoom.h}
                        onChange={(e) => patchRoom(selectedRoom.id, { h: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Поворот (°)</Label>
                      <Input
                        type="number"
                        step={1}
                        value={selectedRoom.rotation ?? 0}
                        onChange={(e) => patchRoom(selectedRoom.id, { rotation: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeRoom(selectedRoom.id)}>
                    Удалить зал
                  </Button>
                </div>
              )}

              {!selected && !selectedRoom && selectedExit && (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Выход</div>
                  <div className="space-y-2">
                    <Label>Подпись</Label>
                    <Input value={selectedExit.label} onChange={(e) => patchExit(selectedExit.id, { label: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">X</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedExit.x}
                        onChange={(e) => patchExit(selectedExit.id, { x: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Y</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedExit.y}
                        onChange={(e) => patchExit(selectedExit.id, { y: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ширина</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedExit.w}
                        onChange={(e) => patchExit(selectedExit.id, { w: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Высота</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={selectedExit.h}
                        onChange={(e) => patchExit(selectedExit.id, { h: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Поворот (°)</Label>
                      <Input
                        type="number"
                        step={1}
                        value={selectedExit.rotation ?? 0}
                        onChange={(e) => patchExit(selectedExit.id, { rotation: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeExit(selectedExit.id)}>
                    Удалить выход
                  </Button>
                </div>
              )}

              {!selected && !selectedRoom && !selectedExit && barSelected && planAnnotations.bar && (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Бар</div>
                  <div className="space-y-2">
                    <Label>Подпись</Label>
                    <Input
                      value={planAnnotations.bar.label}
                      onChange={(e) => patchBar({ label: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">X</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={planAnnotations.bar.x}
                        onChange={(e) => patchBar({ x: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Y</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={planAnnotations.bar.y}
                        onChange={(e) => patchBar({ y: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ширина</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={planAnnotations.bar.w}
                        onChange={(e) => patchBar({ w: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Высота</Label>
                      <Input
                        type="number"
                        step={0.01}
                        value={planAnnotations.bar.h}
                        onChange={(e) => patchBar({ h: parseFloat(e.target.value) || 0.02 })}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Поворот (°)</Label>
                      <Input
                        type="number"
                        step={1}
                        value={planAnnotations.bar.rotation ?? 0}
                        onChange={(e) => patchBar({ rotation: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="destructive" size="sm" onClick={removeBar}>
                    Убрать бар
                  </Button>
                </div>
              )}

              {!selected && !selectedRoom && !selectedExit && !barSelected && (
                <p className="text-sm text-muted-foreground">
                  Выберите стол, зал, выход или бар на схеме — параметры появятся здесь.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
