# OpenAPI Docs MCP

一个厂商无关的 MCP Server，帮助编码 Agent 搜索和理解 OpenAPI/Swagger 文档，且不会调用文档中描述的真实后端接口。

第一版重点保证结果确定、准确和稳定：

- 启动时加载并校验本地或远程 OpenAPI 文档；
- 启动完成后，所有工具调用都直接读取内存；
- 使用明确的字段权重搜索中英文接口元数据；
- 只在查询接口或 Schema 时按需展开本地 `$ref`；
- 限制 Schema 展开深度，并检测循环引用；
- 通过 stdio 暴露 4 个只读 MCP 工具；
- 不绑定 OpenAI、Claude 或其他模型厂商。

## 环境要求

- Node.js 20 或更高版本
- 开发时建议使用 pnpm 11 或更高版本

## 快速开始

包已经发布到 npm：[openapi-docs-mcp](https://www.npmjs.com/package/openapi-docs-mcp)。

### 使用 npx（推荐）

不需要安装，直接下载并运行指定版本：

```bash
npx -y openapi-docs-mcp@0.1.3 \
  --source https://api.example.com/v3/api-docs \
  --timeout 30000
```

建议在 MCP 配置中固定版本，例如 `openapi-docs-mcp@0.1.3`，避免新版本自动升级后改变行为。

如果希望始终使用最新版本：

```bash
npx -y openapi-docs-mcp@latest \
  --source https://api.example.com/v3/api-docs
```

### 使用 pnpm dlx

```bash
pnpm dlx openapi-docs-mcp@0.1.3 \
  --source https://api.example.com/v3/api-docs \
  --timeout 30000
```

### 全局安装

```bash
npm install --global openapi-docs-mcp@0.1.3
```

安装后可以直接执行：

```bash
openapi-docs-mcp \
  --source https://api.example.com/v3/api-docs \
  --timeout 30000
```

升级全局版本：

```bash
npm install --global openapi-docs-mcp@latest
```

## 启动参数示例

### 加载本地文档

支持 OpenAPI/Swagger JSON 和 YAML 文件：

```bash
npx -y openapi-docs-mcp@0.1.3 --source ./openapi.json
```

也可以直接使用位置参数：

```bash
npx -y openapi-docs-mcp@0.1.3 ./openapi.yaml
```

### 加载远程文档

```bash
npx -y openapi-docs-mcp@0.1.3 \
  --source https://api.example.com/v3/api-docs
```

默认远程加载超时时间为 10 秒，可以通过 `--timeout` 修改：

```bash
npx -y openapi-docs-mcp@0.1.3 \
  --source https://api.example.com/v3/api-docs \
  --timeout 20000
```

### 加载需要鉴权的文档

可以重复使用 `--header`，格式为 `NAME=VALUE`：

```bash
npx -y openapi-docs-mcp@0.1.3 \
  --source https://api.example.com/v3/api-docs \
  --header Authorization="Bearer token" \
  --header X-Tenant-Id=tenant-1
```

日志和错误信息只会写入 stderr，stdout 专门用于传输 MCP 消息。

## CLI 参数

```text
用法：openapi-docs-mcp --source <文件或URL> [选项]

选项：
  -s, --source <value>    OpenAPI JSON/YAML 文件或 HTTP(S) URL
      --header NAME=VALUE 加载远程文档时使用的请求头，可重复传入
      --timeout <ms>      远程加载超时时间，默认 10000 毫秒
      --strict-validation 严格模式：任何 OpenAPI 校验警告都会阻止启动
  -h, --help              显示帮助信息
```

## MCP Client 配置

可以在任意支持 stdio MCP Server 的 Client 中通过 `npx` 启动，无需克隆或构建本项目：

```json
{
  "mcpServers": {
    "project-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.3",
        "--source",
        "https://api.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

### VS Code + mise 兼容配置

VS Code 使用顶层字段 `servers`。如果 VS Code 扩展宿主误用了旧版 Node.js 或旧版 `npx`，可能出现 `ERROR: You must supply a command.`。此时可以让 VS Code 通过 `mise` 固定使用 Node.js 24，再启动本包：

```json
{
  "servers": {
    "project-api-docs": {
      "type": "stdio",
      "command": "mise",
      "args": [
        "exec",
        "node@24",
        "--",
        "npx",
        "--yes",
        "openapi-docs-mcp@0.1.3",
        "--source",
        "https://api.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

在终端执行 `where.exe mise` 可以查看本机 `mise.exe` 的实际路径，并替换示例中的 `command`。配置步骤：

1. 在 VS Code 中按 `Ctrl + Shift + P`；
2. 执行 `MCP: Open User Configuration`；
3. 写入上述配置并替换 OpenAPI 地址；
4. 执行 `MCP: List Servers`，启动或重启 `project-api-docs`。

推荐将包含内部 OpenAPI 地址或鉴权信息的配置放在 VS Code 用户配置中，不要提交到项目仓库。MCP 使用 stdio 通信，由 VS Code 负责启动进程，不需要提前在终端中常驻运行命令。

同一个 npm 包可以使用不同 OpenAPI 文档启动多个实例，因此不同项目之间不会冲突。

### 同时配置多个实例

每个实例使用不同的 MCP Server 名称和 `--source`：

```json
{
  "mcpServers": {
    "safety-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.3",
        "--source",
        "https://safety.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    },
    "mall-api-docs": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-docs-mcp@0.1.3",
        "--source",
        "https://mall.example.com/v3/api-docs",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

### 使用本地源码构建

参与开发时才需要克隆源码并构建：

```bash
pnpm install
pnpm build
node dist/cli.js --source ./openapi.json
```

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
