const project = '/projects/[a-f0-9-]{36}/(?:canvas|results|video|compare)';
const known = new RegExp('^(?:/projects|/assets|/tasks|/prompt-generator|/settings/connections|/me|' + project + ')$');
function local(path: string) { if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u0020]/.test(path) || path.includes('//'))
    throw Error('local_navigation_required'); return path; }
export function isMobilePath(path: string) { return /^\/m(?:\/|\?|$)/.test(path) && !path.includes('//') && !path.includes('\\') && !/[\u0000-\u0020]/.test(path); }
export function toMobilePath(path: string) { local(path); if (isMobilePath(path))
    return path; const [base] = path.split(/[?#]/); if (base === '/settings/appearance')
    return '/m/me'; if (base === '/login' || base === '/register')
    return '/m' + path; return known.test(base) ? '/m' + path : '/m/projects'; }
export function toDesktopPath(path: string) { local(path); if (!isMobilePath(path))
    return path; const value = path.slice(2) || '/projects', base = value.split(/[?#]/)[0]; if (base === '/me')
    return '/projects'; if (base.endsWith('/video'))
    return value.replace('/video', '/canvas'); return known.test(base) || base === '/login' || base === '/register' ? value : '/projects'; }
export function mobileReturnPath(path: unknown) { if (typeof path !== 'string' || !isMobilePath(path))
    return '/m/projects'; return known.test(path.slice(2).split(/[?#]/)[0]) ? path : '/m/projects'; }
