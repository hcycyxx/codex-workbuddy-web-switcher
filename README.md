# Codex WorkBuddy 网页版一键切号反代

在 Windows 本机运行一个只监听 `127.0.0.1` 的 WorkBuddy 反向代理，用网页管理国内版 / 国际版账号，并接入 Codex 或 CC Switch。

> **前置条件**：Node.js 22+；接入账号需要 WorkBuddy 官方客户端已登录，或在账号页通过官方授权页扫码。程序不提供账号，也不绕过上游计费。

## 启动

在 PowerShell 中执行：

```powershell
cd C:\path\to\codex-workbuddy-web-switcher
powershell -ExecutionPolicy Bypass -File .\Start-Web.ps1
```

浏览器会打开 <http://127.0.0.1:8900>。

默认请求体上限是 **1 GiB**。需要调整时使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-Web.ps1 -MaxBodyMiB 32
```

停止：

```powershell
powershell -ExecutionPolicy Bypass -File .\Stop-Web.ps1
```

## 添加到 Codex / CC Switch

| 配置 | 值 |
| --- | --- |
| Base URL | `http://127.0.0.1:8900/v1` |
| API Key | 管理页“接入 Codex / CC Switch”中显示的本机密钥 |
| Responses | `/v1/responses` |
| Chat Completions | `/v1/chat/completions` |
| 固定国内版 | `http://127.0.0.1:8900/cn/v1` |
| 固定国际版 | `http://127.0.0.1:8900/global/v1` |

普通 `/v1` 跟随网页中当前选用的账号；`/cn/v1` 和 `/global/v1` 使用各区域当前选用的账号。请求开始时会固定账号，切换账号只影响后续请求。

## 网页功能

- 国内版、国际版账号分别管理，可同时登录多个账号。
- 扫码添加账号，或读取本机已登录的 WorkBuddy 客户端账号。
- 一键选用账号；切换不需要重启 Codex 或反代。
- 查询账号昵称、脱敏 UID、邮箱、手机号、剩余积分。
- 查看上游模型目录、上下文上限、积分倍率及活动倍率。
- 按最近请求的上游 `usage.credit` 统计实际扣分，并绘制消耗 / 剩余积分图。
- 提供 CC Switch 余额查询脚本。

## 数据与安全

- 服务只绑定 `127.0.0.1`，拒绝非本机 Host、跨站请求和跨域读取。
- 账号登录令牌保存在 `data/vault.enc.json`，密钥由 Windows DPAPI 按当前用户保护。
- API Key 和账号令牌不会显示在账号列表中；管理接口使用每次启动生成的短期管理令牌。
- 网页默认使用完整账号资料，但不会提供登录令牌。请勿把 `data/` 目录上传到 GitHub 或发给他人。
- 非官方接入存在上游接口变化或账号受限风险；是否使用由你自行判断。

## 可选环境变量

复制 `.env.example` 作为配置参考。也可以通过 PowerShell 设置：

```powershell
$env:WORKBUDDY_PORT = '8900'
$env:WORKBUDDY_MAX_BODY_MIB = '1024'
$env:WORKBUDDY_DATA = 'D:\private\workbuddy-data'
npm start
```

## 开发

```powershell
npm run check
npm test
```

测试使用模拟账号与模拟上游，不调用真实模型，也不读取真实账号。

## 许可与来源

MIT。复用与参考的开源来源及许可证保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目从本人的 `codex-workbuddy-bridge` 网页实现抽取而来，保留其账号池、积分统计和本地反代能力。
