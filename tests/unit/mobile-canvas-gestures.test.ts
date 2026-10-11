import { describe, it, expect } from 'vitest';
import { createMobileGesture } from '../../src/features/mobile/mobile-canvas-gestures';
describe('mobile observation gestures', () => {
    it('pans a local viewport without changing its scale', () => { const g = createMobileGesture(); g.down(1, { x: 100, y: 200 }, { x: 10, y: 20, scale: 1 }); expect(g.move(1, { x: 130, y: 240 })).toEqual({ x: 40, y: 60, scale: 1 }); });
    it('keeps the initial pinch midpoint under the moving midpoint', () => { const g = createMobileGesture(); g.down(1, { x: 100, y: 100 }, { x: 0, y: 0, scale: 1 }); g.down(2, { x: 200, y: 100 }, { x: 0, y: 0, scale: 1 }); expect(g.move(2, { x: 300, y: 100 })).toEqual({ x: -100, y: -100, scale: 2 }); });
    it('reanchors a remaining finger without jumping after pinch ends', () => { const g = createMobileGesture(); g.down(1, { x: 100, y: 100 }, { x: 0, y: 0, scale: 1 }); g.down(2, { x: 200, y: 100 }, { x: 0, y: 0, scale: 1 }); g.move(2, { x: 300, y: 100 }); g.up(2); expect(g.move(1, { x: 110, y: 120 })).toEqual({ x: -90, y: -80, scale: 2 }); });
    it('stops emitting after cancellation', () => { const g = createMobileGesture(); g.down(1, { x: 10, y: 10 }, { x: 0, y: 0, scale: 1 }); g.cancel(); expect(g.move(1, { x: 100, y: 100 })).toBeUndefined(); });
    it('ignores nonfinite input and unregistered pointers', () => { const g = createMobileGesture(); g.down(1, { x: 10, y: 10 }, { x: 0, y: 0, scale: 1 }); expect(g.move(2, { x: 100, y: 100 })).toBeUndefined(); expect(g.move(1, { x: NaN, y: 10 })).toBeUndefined(); expect(g.move(1, { x: 20, y: 20 })).toEqual({ x: 10, y: 10, scale: 1 }); });
    it('keeps a completed pan when another finger joins before a render', () => { const g = createMobileGesture(); g.down(1, { x: 100, y: 100 }, { x: 0, y: 0, scale: 1 }); g.move(1, { x: 150, y: 130 }); g.down(2, { x: 250, y: 130 }, { x: 0, y: 0, scale: 1 }); expect(g.move(2, { x: 250, y: 130 })).toEqual({ x: 50, y: 30, scale: 1 }); });
});
