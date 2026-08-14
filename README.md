<p align="center">
  <img src="https://raw.githubusercontent.com/yangjh0127/openapi-docs-mcp/main/assets/openapi-docs-mcp-logo.png" alt="OpenAPI Docs MCP" width="760">
</p>

# OpenAPI Docs MCP

> 让编码 Agent 安全、准确地搜索和理解 OpenAPI / Swagger 文档。

[![npm version](https://img.shields.io/npm/v/openapi-docs-mcp?label=npm)](https://www.npmjs.com/package/openapi-docs-mcp)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

**快速导航：** [名称](#名称) · [简介](#简介) · [详细描述](#详细描述) · [项目状态](#项目状态) · [使用方法](#使用方法)

---

## 名称

**OpenAPI Docs MCP**

npm 包：[`openapi-docs-mcp`](https://www.npmjs.com/package/openapi-docs-mcp)

## 简介

一个厂商无关的 MCP Server，让编码 Agent 能够搜索和理解 OpenAPI/Swagger 文档。

服务只读取接口文档，不会调用文档中描述的真实后端 API。它支持本地文件和远程地址，启动后使用内存索引提供稳定、快速的查询。

## 详细描述

OpenAPI Docs MCP 支持 OpenAPI 3.0、3.1 和 Swagger 2.0，可读取 JSON、YAML、本地文件及 HTTP(S) URL。

它提供 5 个 MCP 工具：

| 工具 | 作用 |
| :--- | :--- |
| `search_api` | 按关键词、路径、Tag、描述或 `operationId` 搜索接口 |
| `get_api` | 获取接口参数、请求体、响应和展开后的 Schema |
| `get_schema` | 按名称读取组件 Schema |
| `list_groups` | 列出 OpenAPI Tags 及接口数量 |
| `reload_document` | 重新加载文档，无需重启 MCP Server |

### 核心能力

- 支持中英文接口搜索，并对 Summary、Tag、Path 等字段进行确定性加权；
- 按需展开本地 `$ref`，限制最大深度和属性数量；
- 检测循环引用，并标记无法解析的引用；
- 远程文档支持自定义请求头和超时；
- 刷新失败时保留旧文档，不影响现有查询；
- 通过 stdio 工作，可接入任意兼容 MCP 的 Agent 或 IDE。

## 项目状态

| 项目 | 状态 |
| :--- | :--- |
| 当前版本 | `0.1.4` |
| 运行环境 | Node.js 20+ |
| 项目阶段 | 可用的早期版本 |
| 传输方式 | stdio |
| 许可证 | MIT |

> **说明：** 当前暂不支持外部文件或 URL `$ref`、向量搜索、Streamable HTTP 部署以及真实后端 API 调用。

## 使用方法

### 方式一：通过 npx 运行（推荐）

无需安装或克隆项目，直接在 MCP Client 中启动：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.4",
        "--source",
        "https://api.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

### 方式二：全局安装

安装后可以直接使用 `openapi-docs-mcp` 命令：

```bash
npm install --global openapi-docs-mcp@0.1.4
openapi-docs-mcp --source https://api.example.com/v3/api-docs --timeout 30000
```

对应的 MCP Client 配置：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "openapi-docs-mcp",
      "args": [
        "--source",
        "https://api.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

### 方式三：通过 mise 固定 Node.js

如果 MCP Client 使用了不兼容的 Node.js 或 `npx`，可以通过 mise 固定运行时版本：

```bash
mise exec node@24 -- npx --yes openapi-docs-mcp@0.1.4 \
  --source https://api.example.com/v3/api-docs \
  --timeout 30000
```

在 MCP Client 中，将 `mise` 作为启动命令：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "mise",
      "args": [
        "exec",
        "node@24",
        "--",
        "npx",
        "--yes",
        "openapi-docs-mcp@0.1.4",
        "--source",
        "https://api.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

> **提示：** 不同 MCP Client 的外层配置字段可能是 `mcpServers`、`servers` 或其他名称，但 `command` 和 `args` 的内容相同。如果客户端找不到 `mise`，可通过 Windows 的 `where.exe mise` 或 macOS/Linux 的 `which mise` 查询路径，并将 `command` 替换为绝对路径。

### 方式四：同时连接多个项目

为每份 OpenAPI 文档配置一个独立的 MCP 实例：

```json
{
  "mcpServers": {
    "order-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.4",
        "--source",
        "https://order.example.com/v3/api-docs"
      ]
    },
    "user-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.4",
        "--source",
        "https://user.example.com/v3/api-docs"
      ]
    }
  }
}
```

每个实例单独加载和刷新自己的文档，互不影响。

### 更多启动示例

**读取本地文档**

```bash
npx -y openapi-docs-mcp@0.1.4 --source ./openapi.yaml
```

**读取需要鉴权的远程文档**

```bash
npx -y openapi-docs-mcp@0.1.4 \
  --source https://api.example.com/v3/api-docs \
  --header Authorization="Bearer token" \
  --header X-Tenant-Id=tenant-1 \
  --timeout 30000
```

### CLI 参数

| 参数 | 说明 |
| :--- | :--- |
| `-s, --source <value>` | OpenAPI 文件或 HTTP(S) URL，必填 |
| `--header NAME=VALUE` | 远程文档请求头，可重复使用 |
| `--timeout <ms>` | 远程加载超时，默认 10000 毫秒 |
| `--strict-validation` | 将所有 OpenAPI 校验警告视为错误 |
| `-h, --help` | 显示帮助 |

### 本地开发

```bash
pnpm install
pnpm test
pnpm build
node dist/cli.js --source ./openapi.json
```
