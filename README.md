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
<<<<<<< HEAD

本地 MCP 配置需要使用 `dist/cli.js` 的绝对路径：

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

## MCP 工具

### `search_api`

根据自然语言关键词、路径、标签、描述或 `operationId` 搜索接口，返回经过排序的轻量候选结果。

正常工作流是先调用 `search_api` 找到接口，再把结果中的 `id` 传给 `get_api`。

输入参数：

| 参数     | 必填 | 说明                                             |
| -------- | ---: | ------------------------------------------------ |
| `query`  |   否 | 搜索关键词，例如 `异常分页列表` 或 `create user` |
| `method` |   否 | HTTP 方法过滤条件，例如 `GET`、`POST`            |
| `tag`    |   否 | 精确匹配 OpenAPI Tag                             |
| `limit`  |   否 | 返回数量，默认 10，最大 50                       |

搜索字段权重：

| 字段          | 权重 |
| ------------- | ---: |
| `summary`     |   10 |
| `tags`        |    8 |
| `path`        |    6 |
| `description` |    4 |
| `operationId` |    2 |

中文搜索不依赖空格分词，会使用标准化、包含匹配以及二元/三元字符片段进行评分。

### `get_api`

获取单个接口的完整上下文，包括：

- HTTP 方法和路径；
- Summary、Description 和 Tags；
- Path、Query、Header、Cookie 参数；
- Request Body 和 Content-Type；
- Responses；
- Security 和 Deprecated 元数据；
- 按需展开后的 Schema。

优先传入 `search_api` 返回的 `id`，也可以传入精确的 `path` 和可选的 `method`。

`maxDepth` 用于控制 Schema 最大展开深度，默认值为 5，允许范围为 1 到 12。

### `get_schema`

根据精确名称读取 `components.schemas` 中的 Schema。

本地 `$ref` 会按需展开，同时具有：

- 最大深度限制；
- 最大属性数量限制；
- 循环引用检测；
- 无法解析的引用标记。

### `list_groups`

列出 OpenAPI Tags 及每个 Tag 下的接口数量。

没有 Tag 的接口会归入 `untagged`。

## 推荐调用流程

```text
用户描述需要实现的功能
        ↓
search_api 搜索候选接口
        ↓
根据 summary、tag、path 选择接口
        ↓
get_api 一次获取请求和响应结构
        ↓
必要时再调用 get_schema
        ↓
生成 TypeScript 类型、API 方法和页面调用代码
```

## 开发与测试

```bash
pnpm typecheck
pnpm test
pnpm build
```

当前测试覆盖：

- OpenAPI 3.0 文档加载；
- OpenAPI 3.1 YAML 文档加载；
- Swagger 2.0 文档加载；
- 无效文档错误处理；
- 中文加权搜索；
- Method 和 Tag 过滤；
- 接口请求与响应 Schema 展开；
- 循环引用保护；
- MCP 工具发现与调用。

## 当前版本边界

第一版有意保持较小的功能范围。

已经支持：

- OpenAPI 3.0、3.1；
- Swagger 2.0；
- JSON 和 YAML；
- 本地文件和 HTTP(S) URL；
- 本地 `$ref` 按需展开；
- stdio MCP 传输。

暂不支持：

- 调用真实后端 API；
- 保存或管理后端鉴权凭证；
- 展开其他文件或 URL 中的外部 `$ref`；
- 向量数据库或 Embedding 搜索；
- Streamable HTTP MCP 部署；
- OpenAPI 文档自动刷新；
- 模型厂商私有能力。

当 OpenAPI 文档发生变化时，重启 MCP Server 即可重新加载和建立索引。

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

项目不会把 OpenAPI 数据重新转换成一套重复的核心模型。OpenAPI Document 始终是事实来源，自定义类型只用于搜索结果和 MCP 输出。

Formatter 不会改写已经加载的 OpenAPI 声明。兼容模式只在加载阶段修复能够唯一确定目标的局部缺陷，避免工具凭相似度猜测后端含义。

默认使用兼容校验模式。部分 Springdoc 文档会生成包含中文名称、缺少本地前缀或未转义 JSON Pointer 字符的 `$ref`。只要引用目标能够唯一确定，项目会修复内存副本并输出诊断；不会修改源文件。

### 兼容模式诊断

兼容模式会跳过无法表示为对象的 path item 或 operation，并为缺少 `responses` 的 operation 补充空对象。每一次修复、跳过、未解析引用或歧义引用都会通过 stderr 输出有界摘要，不会污染 MCP 使用的 stdout。

未解析或存在多个精确候选的引用会保持原值，项目不会进行模糊、忽略大小写或裁剪空白后的匹配，也不会加载外部 URL 或文件引用。只有无法解析文档、缺少顶层版本、`info` 或 `paths` 等整体不可用情况才会阻止兼容模式启动。

需要禁用所有修复并让任意 OpenAPI 校验错误阻止启动时，可添加 `--strict-validation`。
=======
>>>>>>> a3b93fdd98548eef1c651dab869bc76ce05e0938
