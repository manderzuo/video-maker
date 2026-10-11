import type { Viewport } from '../../domain/graph';
import { mobileMinScale, mobileMaxScale } from './mobile-canvas-viewport';
type Point = {
    x: number;
    y: number;
};
const valid = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
export function createMobileGesture() {
    const points = new Map<number, Point>();
    let current: Viewport = { x: 0, y: 0, scale: 1 }, base = current, anchor: Point = { x: 0, y: 0 }, distance = 0;
    function reanchor() { const [a, b] = [...points.values()]; base = { ...current }; if (!a)
        return; anchor = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { ...a }; distance = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0; }
    return { down(id: number, point: Point, view: Viewport) { if (!valid(point) || ![view.x, view.y, view.scale].every(Number.isFinite) || view.scale < mobileMinScale || view.scale > mobileMaxScale)
            return; if (points.size === 0)
            current = { ...view }; points.set(id, { ...point }); reanchor(); }, move(id: number, point: Point): Viewport | undefined { if (!points.has(id) || !valid(point))
            return; points.set(id, { ...point }); const [a, b] = [...points.values()]; if (!a)
        return; const center = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a, scale = b && distance > 0 ? Math.max(mobileMinScale, Math.min(mobileMaxScale, base.scale * Math.hypot(b.x - a.x, b.y - a.y) / distance)) : base.scale; current = { scale, x: center.x - (anchor.x - base.x) * scale / base.scale, y: center.y - (anchor.y - base.y) * scale / base.scale }; return { ...current }; }, up(id: number) { points.delete(id); reanchor(); }, cancel() { points.clear(); distance = 0; } };
}
