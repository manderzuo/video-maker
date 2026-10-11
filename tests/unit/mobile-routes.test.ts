import { describe, it, expect } from 'vitest';
import { isMobilePath, toMobilePath, toDesktopPath, mobileReturnPath } from '../../src/features/mobile/mobile-routes';
import { readMobileBuildFlag } from '../../scripts/mobile-build-flag.mjs';
describe('mobile routing isolation', () => {
    it.each([['/m', true], ['/m/projects', true], ['/m/login?returnTo=x', true], ['/models', false], ['//evil.test/m', false], ['/m//evil', false], ['/projects', false]])('recognizes only explicit local mobile paths %s', (path, want) => expect(isMobilePath(path)).toBe(want));
    it.each([['/projects', '/m/projects'], ['/assets', '/m/assets'], ['/tasks', '/m/tasks'], ['/prompt-generator?draft=abc', '/m/prompt-generator?draft=abc'], ['/settings/appearance', '/m/me'], ['/projects/12345678-1234-4234-8234-123456789012/canvas?node=abc', '/m/projects/12345678-1234-4234-8234-123456789012/canvas?node=abc']])('maps known routes and keeps parameters %s', (path, want) => expect(toMobilePath(path)).toBe(want));
    it.each([['/m/projects', '/projects'], ['/m/me', '/projects'], ['/m/projects/12345678-1234-4234-8234-123456789012/video?node=abc', '/projects/12345678-1234-4234-8234-123456789012/canvas?node=abc']])('returns to an ordinary desktop route %s', (path, want) => expect(toDesktopPath(path)).toBe(want));
    it.each(['//evil.test', 'https://evil.test', '/m//evil', '/m/login', '/m/register', '/m/unknown', null])('does not trust unsafe login return paths %s', path => expect(mobileReturnPath(path)).toBe('/m/projects'));
    it('retains a known project login destination', () => expect(mobileReturnPath('/m/projects/12345678-1234-4234-8234-123456789012/results?runId=x')).toBe('/m/projects/12345678-1234-4234-8234-123456789012/results?runId=x'));
    it.each([undefined, '0', '1'])('parses an explicit public build switch %s', value => expect(readMobileBuildFlag(value)).toBe(value === '1'));
    it.each(['true', 'false', 'yes', '', ' 1 '])('rejects ambiguous build switch %s', value => expect(() => readMobileBuildFlag(value)).toThrow('invalid_mobile_build_flag'));
});
