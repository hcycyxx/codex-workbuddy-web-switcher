# 版本记录

## v1.0.0 · 2026-11-09

- 首个独立网页版：国内版 / 国际版账号池、扫码与本机登录导入、一键切号、余额、模型倍率、实际扣分记录和图表。
- 提供 Codex Responses / Chat Completions 与 CC Switch 余额查询接口。
- 默认请求体上限 1 GiB，可通过 `-MaxBodyMiB` 或 `WORKBUDDY_MAX_BODY_MIB` 调整。
- 账号与本地密钥使用当前 Windows 用户的 DPAPI 保护，运行数据不进入 Git。

验收边界：自动化测试只使用模拟账号和模拟上游；真实扫码、余额与模型调用由使用者自行验证。
