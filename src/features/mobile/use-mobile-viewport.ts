import { useEffect, useState } from 'react';
export function useMobileViewport() {
    const read = () => ({ height: Math.round(window.visualViewport?.height ?? window.innerHeight), top: Math.round(window.visualViewport?.offsetTop ?? 0) });
    const [viewport, setViewport] = useState(read);
    useEffect(() => { const update = () => { setViewport(read()); }; const visual = window.visualViewport; visual?.addEventListener('resize', update); visual?.addEventListener('scroll', update); window.addEventListener('resize', update); return () => { visual?.removeEventListener('resize', update); visual?.removeEventListener('scroll', update); window.removeEventListener('resize', update); }; }, []);
    return viewport;
}
