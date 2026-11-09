# Codex WorkBuddy 网页版一键切号反代 v1.0.0

下载 **Windows 便携包**，解压后双击 `Start.cmd` 即可运行。需要 Node.js 22 或更新版本。

## 功能

- 国内版 / 国际版 WorkBuddy 账号分别管理，可同时保存多个账号。
- 扫码添加账号，或读取本机已登录的 WorkBuddy 客户端账号。
- 网页一键切换账号，只影响后续请求，不需要重启 Codex 或反代。
- 查询剩余积分、模型目录、上下文上限、积分倍率和活动倍率。
- 按上游返回的 `usage.credit` 记录实际扣分，并绘制消耗 / 剩余积分图。
- 提供 Codex / CC Switch 的 Chat Completions、Responses 和余额查询接口。
- 默认请求体上限为 1 GiB，可通过 `Start-Web.ps1 -MaxBodyMiB` 调整。

## 接入

启动后打开 `http://127.0.0.1:8900`，在网页中复制本机反代 API Key。

| 配置 | 值 |
| --- | --- |
| Base URL | `http://127.0.0.1:8900/v1` |
| Chat Completions | `/v1/chat/completions` |
| Responses | `/v1/responses` |
| 固定国内版 | `http://127.0.0.1:8900/cn/v1` |
| 固定国际版 | `http://127.0.0.1:8900/global/v1` |

## 数据与安全

- 服务只监听 `127.0.0.1`。
- 账号登录令牌保存在 `data/vault.enc.json`，密钥由当前 Windows 用户的 DPAPI 保护。
- 发布包不包含账号、令牌、余额记录或请求日志。
- 非官方接入可能因 WorkBuddy 上游接口调整而失效；是否使用由使用者自行判断。

## 验证范围

自动化测试使用模拟账号与模拟上游，覆盖账号切号、积分记录、Responses / Chat Completions、请求体上限和本地加密存储。真实扫码、余额和模型调用需要使用者自行完成。
