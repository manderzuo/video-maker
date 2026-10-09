# 首次空内容云端发布

使用现有 SSH `ubuntu@49.232.128.118` 与本机 `Third.pem`，不需要腾讯网页控制台。生产服务仅监听回环地址 4188，公开域名为 `https://studio.gemstory.cn`。独立 PostgreSQL 16 数据库 `aiwork_studio`；运行账号 `www-data`；Node 22.23.3 和 npm 11.6.2 为隔离的固定运行时。

## 发布清单

先提交已验证程序，再运行 `scripts/package-account-cloud.mjs`。构建使用空环境文件目录、新输出目录和明确文件清单。`release.json` 必须含正确提交、每个文件长度与 SHA256，且 `seededAccounts`、`seededContent` 为零。归档不包含本地工作资料、旧静态产物、用户原件、API 密钥、数据库快照或测试资料。上传后同时核对归档和清单中的文件哈希，再安装锁定的生产依赖。

服务器的新程序放入独立 `/opt/aiwork-studio/releases/cloud-<commit>`，由 `/opt/aiwork-studio/cloud-current` 指向。数据保留在 `/var/lib/aiwork-studio/private`，根密钥留在 `/etc/aiwork-studio/cloud-secrets.json`，权限 0600 root。根目录仅允许 root 和 www-data 进入，用户文件目录 0700，文件 0600。

服务通过 systemd `LoadCredential` 接收密钥文件，再用 `install -m 0600` 放入 `/run/aiwork-studio-cloud/keyring.json`；此运行目录为 0700，并随服务停止清理。应用仍验证私有权限。配置 `cloud-runtime.json` 不包含密钥明文。数据库迁移由 root 使用临时 0600 配置读取主密钥，完成后删除临时配置；迁移全事务、校验和和锁定执行，不创建账号或业务数据。

先保持旧公开入口不变，验证新服务健康、数据库迁移数、零用户/零业务资料及零私有文件。候选 Nginx 配置独立检查语法，再替换 `/etc/nginx/conf.d/aiwork-studio.conf`。新配置保留 HTTPS Origin、Cookie、Set-Cookie，转发地址仅来自 Nginx 写入的客户端地址；旧匿名代理和私有目录返回 404。其他站点配置不修改。

## 已演练的备份与恢复

备份脚本：`sudo bash /opt/aiwork-studio/cloud-current/scripts/backup-account-cloud.sh`。脚本短暂停止云端写入，生成 PostgreSQL custom dump、私有目录原件、配置、发布身份及哈希清单，再启动服务。主密钥单独保存，所有备份目录 0700、文件 0600 root。

实际服务器演练快照：`20261009T025505Z-8c25aca6-5851-4253-bb37-da09ef87557a`。数据位于 `/var/backups/aiwork-studio/<snapshot>`，密钥在 `/var/backups/aiwork-studio-secrets/<snapshot>`。已在独立数据库 `aiwork_restore_check_20261009`、独立私有目录和 4191 服务恢复，确认健康、7 个迁移、零用户及资料，独立 credential 成功载入；临时数据库、服务、配置和目录随后删除。

公开切换前另外生成一致快照 `20261009T032428Z-75480394-0c8d-45eb-b63b-6ea4caefe81b`。实际部署程序为 `f98fe3e412d67892dca4f73e867a49b92a0f12fd`，归档 SHA256 `87e9d89dcd6de304eceb4e1b2cf2bc0aaedfe9ab781c29b797a54e789f5acfbe`。备份旧 Nginx、云端服务、配置及旧候选指针保存在 `/opt/aiwork-studio/backups/20261009-cloud-f98fe3e-switch`，权限 0700/0600 root。

恢复时先核对两份哈希清单。使用 root 打开的 dump 文件作为标准输入传给 postgres 的 `pg_restore --no-owner --no-acl --role=aiwork_studio --exit-on-error`，无需放宽 root 备份目录权限。私有归档只接受 `private` 下的普通文件和目录，拒绝链接、绝对路径和 `..`；恢复后将文件设为 www-data、0600，目录为 www-data、0700。使用隔离数据库、目录、端口、运行密钥和配置启动同版本应用，确认迁移校验与业务读取。生产数据库恢复另行依据故障时间与新写入情况制定，不能直接套用演练覆盖生产。

## 切换与回退

切换前保存旧 Nginx、服务、配置及公开发布指针，另做一致备份。Nginx 语法通过后 reload，正常可信 HTTPS 浏览器核对注册、登录、跨会话恢复、账号隔离、私有媒体、偏好、API 密钥遮蔽和旧代理关闭。仅使用本次创建的临时账号与合成素材，不发起模型探测或生成；验收后凭精确 UUID 和用户名清理对应记录及私有目录，再确认空内容。

本次已执行公开切换、零用户状态下恢复旧入口/核对旧构建/重新切回云端、正常 HTTPS 健康检查及 9 项 Edge 浏览器检查。24 个程序归档文件和 8 个公开静态文件哈希通过。两个临时账号和所属私有目录已清理，业务表及私有文件为零；cloud 服务已 enable，未被其他 Nginx 配置引用的旧服务已 stop/disable。Nginx reload 后应等目标构建哈希稳定再验证，避免把旧 worker 的短暂响应计为构建不匹配。

已有云端账号写入后，不能回退到匿名工作台，也不能用发布前快照覆盖新资料。保留 PostgreSQL、私有文件及全部密钥版本，必要时维护入口暂停写入，发布兼容当前数据库的修复版本。只有确认尚无云端用户写入时，才允许恢复本次保存的旧公开入口。旧 F0 服务可保留用于故障诊断，但不作为带账号数据的正常回退入口。

## 验收边界

本次有真实 PostgreSQL、文件存储、严格本机 HTTPS 与服务器恢复演练；模型上游联合检查使用模拟供应商，没有真实付费生成。历史匿名界面验收集仍未改成账号流程，整项目 `verify` 尚未通过。旧资料迁移由用户明确选择，覆盖代表性资料，不承诺所有旧格式；空内容发布不会执行迁移。
