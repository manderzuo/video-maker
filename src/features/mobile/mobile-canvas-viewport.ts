import { z } from 'zod';
import { viewportSchema, type Viewport } from '../../domain/graph';
import type { Rect } from '../canvas/geometry';

export const mobileMinScale = .001;
export const mobileMaxScale = 2;
// Observation is local: the cloud/desktop viewport schema remains unchanged.
export const mobileViewportSchema = viewportSchema.extend({ scale: z.number().min(mobileMinScale).max(mobileMaxScale) });

export function initialMobileViewport(rectangles: Rect[], width: number, height: number, remembered?: Viewport): Viewport | undefined {
    if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
    const intersects = (rect: Rect, view: Viewport) => rect.right * view.scale + view.x > 0 && rect.bottom * view.scale + view.y > 0 && rect.left * view.scale + view.x < width && rect.top * view.scale + view.y < height;
    if (remembered && mobileViewportSchema.safeParse(remembered).success && (!rectangles.length || rectangles.some(rect => intersects(rect, remembered)))) return remembered;
    if (!rectangles.length) return { x: 0, y: 0, scale: 1 };
    const fit = (bounds: Rect): Viewport => {
        const w = bounds.right - bounds.left, h = bounds.bottom - bounds.top, padding = Math.min(48, width / 4, height / 4);
        const scale = Math.max(mobileMinScale, Math.min(mobileMaxScale, (width - 2 * padding) / w, (height - 2 * padding) / h));
        return { scale, x: (width - w * scale) / 2 - bounds.left * scale, y: (height - h * scale) / 2 - bounds.top * scale };
    };
    const bounds = rectangles.reduce((result, rect) => ({ left: Math.min(result.left, rect.left), top: Math.min(result.top, rect.top), right: Math.max(result.right, rect.right), bottom: Math.max(result.bottom, rect.bottom) }));
    const view = fit(bounds);
    // Extremely sparse coordinates can still exceed the mobile zoom range.
    // Start on an actual node instead of an empty midpoint in that case.
    return rectangles.some(rect => intersects(rect, view)) ? view : fit(rectangles[0]);
}
