import { createContext, useContext, type AnchorHTMLAttributes } from 'react';
import { LocalLink, navigate } from '../../app/routes';
export type WorkspaceNavigation = {
    href: (path: string) => string;
    go: (path: string) => void;
};
export const WorkspacePresentation = createContext<{
    presentation: 'desktop' | 'mobile';
    navigation?: WorkspaceNavigation;
    suspended?: boolean;
    viewport?: {
        height: number;
        top: number;
    };
}>({ presentation: 'desktop' });
export const useWorkspacePresentation = () => useContext(WorkspacePresentation);
export const useWorkspaceNavigate = () => useWorkspacePresentation().navigation?.go ?? navigate;
export function WorkspaceLink({ href = '/', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) { const { navigation } = useWorkspacePresentation(); return <LocalLink {...props} href={navigation?.href(href) ?? href}/>; }
