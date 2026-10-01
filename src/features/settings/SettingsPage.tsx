import {UnavailableCapability} from './UnavailableCapability';
import {unverifiedCapabilities} from '../../domain/connection';
import {LocalLink} from '../../app/routes';
import {ConnectionSettings} from './ConnectionSettings';
import {CapabilitySettings} from './CapabilitySettings';
import {StorageSettings} from './StorageSettings';
import {Preferences} from './Preferences';
export function SettingsPage({pathname}:{pathname:string}){return <><nav className="actions" aria-label="设置分类"><LocalLink href="/settings/connections">连接与授权</LocalLink><LocalLink href="/settings/capabilities">模型与能力</LocalLink><LocalLink href="/settings/appearance">外观与播放</LocalLink><LocalLink href="/settings/storage">本地数据与备份</LocalLink><LocalLink href="/settings/backup">可选备份说明</LocalLink></nav>{pathname==='/settings/connections'?<ConnectionSettings/>:pathname==='/settings/capabilities'||pathname==='/settings/models'?<CapabilitySettings/>:pathname==='/settings/appearance'||pathname==='/settings/preferences'?<Preferences/>:pathname==='/settings/storage'?<StorageSettings/>:pathname==='/settings/backup'?<section className="card"><h2>可选备份说明</h2><UnavailableCapability id="webdav-backup" caps={unverifiedCapabilities()}/><p>WebDAV备份当前未开放。没有自动上传、实时多人协作或覆盖已有数据；可以手动导出当前浏览器项目包。</p><LocalLink href="/projects/packages">项目备份与恢复</LocalLink></section>:<p>请选择设置分类。</p>}</>;}
