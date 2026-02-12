# Tanebi MCP Server

Tanebi API にアクセスするための [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバー。
Claude Code などの AI ツールから企画の一覧取得・詳細取得・新規作成が可能。

## セットアップ

```bash
cd mcp-server
npm install
npm run build
```

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `TANEBI_API_KEY` | Yes | Tanebi iOS アプリの設定画面から発行した API Key |
| `TANEBI_API_BASE_URL` | No | API のベース URL（デフォルト: `http://localhost:3000`） |

## 提供ツール

### `list_ideas` - 企画一覧取得

公開されている企画の一覧を取得する。

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `page` | number | No | 1 | ページ番号 |
| `per_page` | number | No | 20 | 1ページあたりの件数（最大100） |

### `get_idea` - 企画詳細取得

指定した企画の詳細情報（本文ライン・リアクション含む）を取得する。

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `idea_id` | number | Yes | 企画の ID |

### `create_idea` - 企画新規作成

新しい企画を作成する。`content` は空行区切りで段落に分割され、`#` で始まる段落は見出しになる。

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `title` | string | Yes | - | 企画タイトル |
| `content` | string | No | - | 企画の本文 |
| `visibility` | `"public"` \| `"private"` | No | `"public"` | 公開範囲 |

## Claude Code での設定

`~/.claude.json` または `.claude/settings.json` に追加:

```json
{
  "mcpServers": {
    "tanebi": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "TANEBI_API_KEY": "your-api-key"
      }
    }
  }
}
```

開発時は `tsx` で直接実行も可能:

```json
{
  "mcpServers": {
    "tanebi": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server/src/index.ts"],
      "env": {
        "TANEBI_API_KEY": "your-api-key"
      }
    }
  }
}
```
