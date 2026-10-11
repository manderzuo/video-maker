import { ApiError } from '../../infrastructure/api/client';
import { createWorkspaceClient, type WorkspaceBridge, type WorkspaceClient } from '../../infrastructure/api/workspace-client';

// Keep the editor's client identity stable while replacing an aborted transport
// after the same account has been revalidated. No request may use cached auth.
export function createMobileWorkspaceClient(bridge: WorkspaceBridge): WorkspaceClient {
    const initial = bridge.getIdentity();
    let transport = createWorkspaceClient(bridge), reset = false, disposed = false, changed = false;
    const unsubscribe = bridge.subscribe(() => {
        const identity = bridge.getIdentity();
        if (!identity || identity.userId !== initial?.userId || identity.contextId !== initial?.contextId) {
            transport.dispose();
            reset = true;
            if (identity) changed = true;
        }
    });
    return new Proxy(transport, {
        get(target, property) {
            if (property === 'dispose') return () => { disposed = true; unsubscribe(); transport.dispose(); };
            const value = Reflect.get(target, property);
            if (typeof value !== 'function') return value;
            if (property === 'contentUrl') return value;
            return (...args: unknown[]) => {
                const identity = bridge.getIdentity();
                if (disposed || changed || !initial || !identity || identity.userId !== initial.userId || identity.contextId !== initial.contextId) return Promise.reject(new ApiError(0, 'STALE_RESPONSE'));
                if (reset) { transport = createWorkspaceClient(bridge); reset = false; }
                return Reflect.apply(Reflect.get(transport, property), transport, args);
            };
        },
    });
}
