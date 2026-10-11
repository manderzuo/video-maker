import type { ReactNode, CSSProperties } from 'react';
import { LocalLink } from '../../app/routes';
export function MobileShell({ children, username, height, bottomInset = 0 }: {
    children: ReactNode;
    username?: string;
    height: number;
    bottomInset?: number;
}) {
    const links = [['项目', '/m/projects'], ['创作', '/m/prompt-generator'], ['素材', '/m/assets'], ['任务', '/m/tasks'], ['我的', '/m/me']];
    return <div className="mobile-workspace" style={{ '--mobile-height': height + 'px', '--mobile-bottom-inset': bottomInset + 'px' } as CSSProperties}><header className="mobile-header"><LocalLink href="/m/projects" aria-label="手机项目首页">AI WORK Studio<small>手机预览</small></LocalLink>{username ? <span>{username}</span> : null}</header><main className="mobile-content">{children}</main>{username ? <nav className="mobile-bottom-nav" aria-label="手机主导航">{links.map(([label, href]) => <LocalLink key={href} href={href} aria-current={location.pathname === href ? 'page' : undefined}>{label}</LocalLink>)}</nav> : null}</div>;
}
