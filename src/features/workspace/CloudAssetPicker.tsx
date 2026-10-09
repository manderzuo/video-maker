import {useEffect, useRef, useState} from 'react';
import type {Asset} from '../../domain/asset';
import type {WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {CloudAssetMedia, uploadCloudAsset} from './CloudAssetsPage';
import {Button} from '../../ui/Button';

export function CloudAssetPicker({
  client,
  assets,
  canWrite,
  onPick,
  onUploaded,
}: {
  client: WorkspaceClient;
  assets: Asset[];
  canWrite: boolean;
  onPick: (asset: Asset) => void;
  onUploaded: (asset: Asset) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function upload(current: File | null) {
    if (!current || uploading) return;
    setUploading(true);
    setError('');
    setMessage('');
    setProgress(`正在上传 ${current.name}…`);
    try {
      const asset = await uploadCloudAsset(client, current);
      if (!alive.current) return;
      setFile(null);
      setProgress('');
      setMessage(`已进入云端素材库：${asset.title}`);
      onUploaded(asset);
    } catch (e) {
      if (!alive.current) return;
      setProgress('');
      setError(e instanceof Error ? e.message : '上传失败，可重试；未产生假素材节点。');
    } finally {
      if (alive.current) setUploading(false);
    }
  }

  return (
    <div className="cloud-asset-picker">
      <h3>使用云端素材</h3>
      {assets.length ? (
        <div className="cloud-assets-grid">
          {assets.map((asset) => (
            <article className="card" key={asset.id}>
              <h4>{asset.title}</h4>
              <CloudAssetMedia client={client} asset={asset} />
              <p className="muted">
                {asset.mediaType} · {asset.bytes} 字节
              </p>
              <Button
                data-interaction-id="cloud:asset:pick"
                disabled={!canWrite}
                onClick={() => onPick(asset)}
              >
                选择此素材
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <p>云端素材库暂无内容，可先在下方上传。</p>
      )}
      <h3>上传素材</h3>
      <label>
        选择本地文件
        <input
          data-interaction-id="cloud:asset:picker-files"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*"
          disabled={!canWrite || uploading}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setError('');
            event.target.value = '';
          }}
        />
      </label>
      {file ? <p>待上传：{file.name}（{file.size} 字节）</p> : null}
      {progress ? <p role="status">{progress}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="actions">
        <Button
          data-interaction-id="cloud:asset:picker-upload"
          variant="primary"
          busy={uploading}
          disabled={!canWrite || !file}
          onClick={() => void upload(file)}
        >
          上传到云端素材库
        </Button>
        {error && file ? (
          <Button disabled={!canWrite || uploading} onClick={() => void upload(file)}>
            重试上传
          </Button>
        ) : null}
      </div>
      <p className="muted">上传完成后进入云端素材库，再选择即可添加节点；失败不会产生假素材节点。</p>
    </div>
  );
}
