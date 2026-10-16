import { useEffect, useState } from 'react';
import type { Asset } from '../../domain/asset';
import { workspaceMessage, type WorkspaceClient } from '../../infrastructure/api/workspace-client';
import { Button } from '../../ui/Button';

// Canvas media stays passive so a finger on the preview still pans/selects the
// node. Native playback controls are available in the unscaled preview dialog.
export function MobileNodeMedia({ client, assetId, interactive = false, onRetry }: {
    client: WorkspaceClient;
    assetId: string;
    interactive?: boolean;
    onRetry?: () => void;
}) {
    const [files, setFiles] = useState<{ asset: Asset; thumbnail: boolean }>();
    const [variant, setVariant] = useState<'original' | 'thumbnail'>('original');
    const [error, setError] = useState(''), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setFiles(undefined); setError(''); setFailed(false);
        void client.readAssetFiles(assetId).then(value => {
            if (!active) return;
            setFiles({ asset: value.asset, thumbnail: !!value.thumbnail });
            setVariant(!interactive && value.asset.mediaType === 'image' && value.thumbnail ? 'thumbnail' : 'original');
        }).catch(failure => { if (active) setError(workspaceMessage(failure)); });
        return () => { active = false; };
    }, [client, assetId, interactive, attempt]);
    const retry = () => { setAttempt(value => value + 1); onRetry?.(); };
    if (error) return <div className="mobile-node-media"><p>素材暂时无法读取：{error}</p>{interactive ? <Button onClick={retry}>重新读取素材</Button> : <small>选中节点后可打开预览重试。</small>}</div>;
    if (!files) return <p className="mobile-node-media-loading">正在读取素材…</p>;
    const { asset, thumbnail } = files, url = client.contentUrl(assetId);
    return <div className={'mobile-node-media' + (interactive ? ' mobile-node-media-interactive' : '')}>
        {asset.mediaType === 'image' && !failed ? <img loading={interactive?"eager":"lazy"} fetchPriority={interactive?"high":"low"} src={client.contentUrl(assetId, variant)} alt={asset.title} onError={() => { if (variant === 'thumbnail') setVariant('original'); else setFailed(true); }}/> : null}
        {asset.mediaType === 'video' && !failed ? <video key={attempt} src={url} aria-label={asset.title} poster={thumbnail ? client.contentUrl(assetId, 'thumbnail') : undefined} controls={interactive} preload={interactive||!thumbnail?"metadata":"none"} muted playsInline onError={() => setFailed(true)}/> : null}
        {asset.mediaType === 'audio' ? interactive ? <audio key={attempt} src={url} controls preload="metadata" onError={() => setFailed(true)}/> : <p>音频素材 · {asset.title}</p> : null}
        {asset.mediaType === 'text' ? <p>文字素材 · {asset.title}</p> : null}
        {failed ? <><p>当前浏览器无法预览此文件，请下载原件查看。</p>{interactive ? <Button onClick={retry}>重新读取素材</Button> : null}</> : null}
        {interactive ? <><p>{asset.title}</p><a className="button" href={url} download={asset.title}>下载原件</a></> : null}
    </div>;
}
