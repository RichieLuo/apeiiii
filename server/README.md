# 晶塔远征服务端

需要 Go 1.26 或以上版本、PostgreSQL 和已构建的前端。首次启动会在 `DATABASE_URL` 指定的数据库中创建账号、会话和存档表。连接数据库的账号需要拥有建表权限。

从项目根目录运行以下 PowerShell 命令。数据库需预先创建，请把示例连接串换成自己的连接串。

```powershell
npm run build
Set-Location server
$env:DATABASE_URL = 'postgres://tower_user:YOUR_PASSWORD@127.0.0.1:5432/crystal_tower?sslmode=disable'
go run .
```

默认监听 `:8080`，浏览器打开 `http://localhost:8080/`。同一局域网中的手机可通过电脑的局域网地址访问对应端口。`ADDR` 可覆盖监听地址，`STATIC_DIR` 可覆盖前端构建目录。通过 HTTPS 反向代理对外提供服务时，将 `APP_ORIGIN` 设为浏览器访问的 HTTPS 源，例如 `https://tower.example.com`，以启用 Secure 会话 Cookie 并校验写请求来源。

## API

| 方法和路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `POST /api/auth/register` | `{ "username": "...", "password": "..." }` | `201`，`{ "username": "..." }`，设置会话 Cookie |
| `POST /api/auth/login` | `{ "username": "...", "password": "..." }` | `200`，`{ "username": "..." }`，设置会话 Cookie |
| `GET /api/auth/session` | 会话 Cookie | `200`，`{ "username": "..." }` |
| `POST /api/auth/logout` | 会话 Cookie | `204`，清除会话 Cookie |
| `GET /api/save` | 会话 Cookie | `200`，`{ "version": 0, "state": null, "updatedAt": null }` 或已存档内容 |
| `PUT /api/save` | 会话 Cookie 和 `{ "version": 0, "state": { ... } }` | `200`，`{ "version": 1, "updatedAt": "..." }` |

用户名会去除首尾空格并转换为小写，允许 3–32 个 ASCII 字母、数字、下划线或连字符，首字符须为字母或数字。密码长度为 8–72 个 UTF-8 字节。存档接口支持 `X-Save-Account` 请求头，账号与会话不一致时返回 `401 account_changed`。保存时使用上次读取的版本，版本冲突返回 `409 save_conflict` 和当前 `version`。错误响应包含 `error` 和 `message`。

## 测试

在 `server` 目录运行 `go test ./...`。将 `TEST_DATABASE_URL` 指向专用测试数据库，可同时运行 PostgreSQL 集成测试。
