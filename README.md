<p align="center">
  <img src="https://raw.githubusercontent.com/yangjh0127/openapi-docs-mcp/main/assets/openapi-docs-mcp-logo.png" alt="OpenAPI Docs MCP" width="760">
</p>

# OpenAPI Docs MCP

> 让编码 Agent 安全、准确地搜索和理解 OpenAPI / Swagger 文档。

[![npm version](https://img.shields.io/npm/v/openapi-docs-mcp?label=npm)](https://www.npmjs.com/package/openapi-docs-mcp)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

OpenAPI Docs MCP 是一个厂商无关的 MCP Server。它读取本地或远程的 OpenAPI 文档，在内存中建立索引，让编码 Agent 能快速搜索接口并获取参数、请求体、响应和 Schema。

服务只读取接口文档，不会调用文档中描述的真实后端 API。

## 功能特性

- 支持 OpenAPI 3.0、3.1 和 Swagger 2.0；
- 支持 JSON、YAML、本地文件和 HTTP(S) URL；
- 支持中英文搜索，并对 Summary、Tag、Path 等字段进行确定性加权；
- 按需展开本地 `$ref`，限制最大深度和属性数量；
- 检测循环引用，并标记无法解析的引用；
- 兼容模式可保守修复能够明确解析的脏 `$ref`；
- 远程文档支持自定义请求头和超时；
- 支持运行时重新加载，失败时继续保留旧文档；
- 通过 stdio 接入任意兼容 MCP 的 Agent 或 IDE。

## 快速开始

要求 Node.js 20 或更高版本。无需安装或克隆项目，直接把以下配置加入 MCP Client：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp",
        "--source",
        "https://api.example.com/v3/api-docs"
      ]
    }
  }
}
```

不同客户端的外层字段可能是 `mcpServers`、`servers` 或其他名称，但 `command` 和 `args` 的内容相同。

### 读取本地文档

```bash
npx -y openapi-docs-mcp --source ./openapi.yaml
```

MCP Client 中使用本地文件时，建议将文档路径写成绝对路径。

### 读取需要鉴权的远程文档

```bash
npx -y openapi-docs-mcp \
  --source https://api.example.com/v3/api-docs \
  --header Authorization="Bearer token" \
  --header X-Tenant-Id=tenant-1 \
  --timeout 30000
```

### 同时连接多个项目

每份 OpenAPI 文档对应一个独立实例：

```json
{
  "mcpServers": {
    "order-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp",
        "--source",
        "https://order.example.com/v3/api-docs"
      ]
    },
    "user-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp",
        "--source",
        "https://user.example.com/v3/api-docs"
      ]
    }
  }
}
```

各实例独立加载和刷新自己的文档，互不影响。

## 其他安装方式

### 全局安装

```bash
npm install --global openapi-docs-mcp
openapi-docs-mcp --source https://api.example.com/v3/api-docs
```

全局安装后的 MCP 配置：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "openapi-docs-mcp",
      "args": ["--source", "https://api.example.com/v3/api-docs"]
    }
  }
}
```

### 使用 mise 固定 Node.js 版本

如果 MCP Client 使用的 Node.js 或 `npx` 不兼容，可以通过 mise 固定运行时：

```bash
mise exec node@24 -- npx --yes openapi-docs-mcp \
  --source https://api.example.com/v3/api-docs
```

对应的 MCP 配置：

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
        "openapi-docs-mcp",
        "--source",
        "https://api.example.com/v3/api-docs"
      ]
    }
  }
}
```

如果客户端找不到 `mise`，可使用 Windows 的 `where.exe mise` 或 macOS/Linux 的 `which mise` 查询路径，并将 `command` 替换为绝对路径。

## CLI 参数

| 参数                   | 说明                                            |
| :--------------------- | :---------------------------------------------- |
| `-s, --source <value>` | OpenAPI JSON/YAML 文件或 HTTP(S) URL，必填      |
| `--header NAME=VALUE`  | 加载远程文档时使用的请求头，可重复传入          |
| `--timeout <ms>`       | 远程加载超时，默认 10000 毫秒                   |
| `--strict-validation`  | 禁用兼容修复，并将所有 OpenAPI 校验警告视为错误 |
| `-h, --help`           | 显示帮助                                        |

## MCP 工具

| 工具              | 作用                                               |
| :---------------- | :------------------------------------------------- |
| `search_api`      | 按关键词、路径、Tag、描述或 `operationId` 搜索接口 |
| `get_api`         | 获取接口参数、请求体、响应和展开后的 Schema        |
| `get_schema`      | 按名称读取组件 Schema                              |
| `list_groups`     | 列出 OpenAPI Tags 及接口数量                       |
| `reload_document` | 重新加载文档，无需重启 MCP Server                  |

### `search_api`

返回经过排序的轻量候选结果。推荐先搜索，再把结果中的 `id` 传给 `get_api`。

| 参数     | 必填 | 说明                                             |
| :------- | :--: | :----------------------------------------------- |
| `query`  |  否  | 搜索关键词，例如 `异常分页列表` 或 `create user` |
| `method` |  否  | HTTP 方法过滤条件，例如 `GET`、`POST`            |
| `tag`    |  否  | 精确匹配 OpenAPI Tag                             |
| `limit`  |  否  | 返回数量，默认 10，最大 50                       |

搜索依次侧重 `summary`、`tags`、`path`、`description` 和 `operationId`。中文搜索不依赖空格分词，会结合标准化、包含匹配和字符片段进行评分。

### `get_api`

获取单个接口的完整上下文，包括 HTTP 方法、路径、参数、请求体、响应、Tags、Security、Deprecated 元数据和展开后的 Schema。

优先传入 `search_api` 返回的 `id`；也可以传入精确的 `path` 和可选的 `method`。`maxDepth` 控制 Schema 最大展开深度，默认 5，范围为 1–12。

### `get_schema`

按精确名称读取 `components.schemas` 中的 Schema。`maxDepth` 同样默认为 5，范围为 1–12。本地 `$ref` 展开具有深度、属性数量和循环引用保护。

### `list_groups`

列出 OpenAPI Tags 及每个 Tag 下的接口数量。没有 Tag 的接口归入 `untagged`。

### `reload_document`

重新加载并校验启动时指定的文档，然后原子替换内存索引。加载失败时返回错误，并继续使用上一次成功加载的文档。

## 推荐调用流程

```text
用户描述需要实现的功能
        ↓
search_api 搜索候选接口
        ↓
根据 summary、tag、path 选择接口
        ↓
get_api 获取请求和响应结构
        ↓
必要时调用 get_schema
        ↓
生成类型、API 方法或业务代码
```

## 文档兼容与校验

默认使用兼容校验模式。部分 Springdoc 文档会生成包含中文名称、缺少本地前缀或未转义 JSON Pointer 字符的 `$ref`。只要目标能够唯一确定，项目就会修复内存副本并输出诊断，但不会修改源文件。

兼容模式还会跳过无法表示为对象的 path item 或 operation，并为缺少 `responses` 的 operation 补充空对象。修复、跳过、未解析引用和歧义引用会通过 stderr 输出有界摘要，不会污染 MCP 使用的 stdout。

无法解析或存在多个精确候选的引用会保留原值。项目不会进行模糊、忽略大小写或裁剪空白后的匹配，也不会加载外部 URL 或文件引用。无法解析文档，或缺少顶层版本、`info`、`paths` 等整体不可用的情况，仍会阻止服务启动。

如需禁用所有兼容修复，请使用 `--strict-validation`。

## 当前限制

- 不调用真实后端 API；
- 不保存或管理后端鉴权凭证；
- 不展开其他文件或 URL 中的外部 `$ref`；
- 不提供向量数据库或 Embedding 搜索；
- 不支持 Streamable HTTP 部署；
- 不自动轮询 OpenAPI 文档或监听文件变化；
- 不依赖模型厂商私有能力。

文档发生变化时，可调用 `reload_document`，也可以重启 MCP Server。

## 本地开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node dist/cli.js --source ./openapi.json
```

本地 MCP 配置需要使用 `dist/cli.js` 和 OpenAPI 文档的绝对路径：

```json
{
  "mcpServers": {
    "local-api-docs": {
      "command": "node",
      "args": [
        "C:/absolute/path/openapi-docs-mcp/dist/cli.js",
        "--source",
        "C:/absolute/path/openapi.json"
      ]
    }
  }
}
```

## 设计原则

```text
OpenAPI / Swagger
        ↓
解析、保守归一化与校验
        ↓
标准 OpenAPI Document
        ↓
内存 Operation 索引
        ↓
Search + Formatter
        ↓
标准 MCP Tools
        ↓
任意支持 MCP 的 Agent 或 IDE
```

OpenAPI Document 始终是事实来源，自定义类型只用于搜索结果和 MCP 输出。Formatter 不会改写已加载的 OpenAPI 声明；兼容模式只在加载阶段修复能够唯一确定目标的局部缺陷，避免根据相似度猜测后端含义。

## License

[MIT](LICENSE)
