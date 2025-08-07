# GitHub Issue to Asana タスク自動連携ツール

## 📋 概要

このツールは、GitHub IssuesとAsanaのタスクを自動的に同期するGitHub Actionsワークフローです。GitHub上でのIssue管理とAsanaでのプロジェクト管理を シームレス に連携させることで、チームの生産性を向上させます。

## ✨ 主な機能

- **自動タスク作成**: GitHub Issueが作成されると、自動的にAsanaタスクを作成
- **ステータス同期**: Issueのクローズ/リオープンに連動してAsanaタスクのステータスを更新
- **コメント同期**: GitHub Issueへのコメントを自動的にAsanaタスクにコメントとして追加
- **セクション管理**: 全てのタスクを指定されたAsanaセクションに自動配置
- **メタデータ保持**: リポジトリ名、Issue番号、GitHubリンクなどの情報を自動付与

## 🔧 前提条件

- Node.js 20以降
- Asanaアカウントとワークスペース
- GitHubリポジトリ（Actions権限付き）
- Asana Personal Access Token (PAT)

## 📝 セットアップ手順

### 1. Asana APIの設定

#### Asana Personal Access Token (PAT) の取得
1. [Asana Developer Console](https://app.asana.com/0/developer-console) にアクセス
2. 「Personal access tokens」セクションで「+ Create new token」をクリック
3. トークンに名前を付けて作成
4. 生成されたトークンをコピー（一度しか表示されません）

#### 必要なAsana情報の取得
- **Workspace ID**: Asanaのワークスペース設定から確認
- **Project ID**: 対象プロジェクトのURLから取得（例: `https://app.asana.com/0/PROJECT_ID/list`）
- **Section名**: タスクを配置したいセクションの名前

### 2. GitHubリポジトリの設定

リポジトリの Settings > Secrets and variables > Actions で以下のシークレットを設定：

| シークレット名 | 説明 | 取得方法 |
|---------------|------|----------|
| `ASANA_PAT` | Asana Personal Access Token | 上記手順で取得 |
| `ASANA_WORKSPACE_ID` | AsanaワークスペースのID | Asana設定から確認 |
| `ASANA_PROJECT_ID` | 連携先AsanaプロジェクトのID | プロジェクトURLから取得 |
| `ASANA_SECTION` | タスクを配置するセクション名 | Asanaプロジェクト内のセクション名 |

### 3. ファイルの配置

1. リポジトリに以下のディレクトリ構造を作成：
```
.github/
  workflows/
    github-issues-to-asana.yml
scripts/
  asana-integration.js
```

2. 各ファイルをコピー

## 🚀 使用方法

### 自動実行

以下のGitHubイベントで自動的に実行されます：

- **Issue作成時** (`opened`): 新しいAsanaタスクを作成
- **Issue終了時** (`closed`): Asanaタスクを完了に変更
- **Issue再開時** (`reopened`): Asanaタスクを未完了に変更
- **Issueコメント追加時** (`created`): Asanaタスクにコメントを追加

### 動作確認

1. GitHubリポジトリで新しいIssueを作成
2. Actions タブで実行状況を確認
3. Asanaプロジェクトでタスクが作成されているか確認

### ローカルでのテスト実行

```bash
# 環境変数を設定
export ASANA_PAT="your_pat_here"
export ASANA_WORKSPACE_ID="your_workspace_id"
export ASANA_PROJECT_ID="your_project_id"
export ASANA_SECTION="your_section_name"
export GITHUB_EVENT_NAME="issues"
export GITHUB_REPOSITORY="owner/repo"

# 実行
node scripts/asana-integration.js
```

## ⚙️ 設定項目の詳細

### 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `ASANA_PAT` | Asana APIアクセス用トークン | ✓ |
| `ASANA_WORKSPACE_ID` | タスクを作成するワークスペースID | ✓ |
| `ASANA_PROJECT_ID` | タスクを追加するプロジェクトID | ✓ |
| `ASANA_SECTION` | タスクを配置するセクション名 | ✓ |
| `GITHUB_TOKEN` | GitHub API認証トークン（自動設定） | ✓ |
| `GITHUB_EVENT_NAME` | GitHubイベント名（自動設定） | ✓ |
| `GITHUB_EVENT_PATH` | イベントペイロードファイルパス（自動設定） | ✓ |
| `GITHUB_REPOSITORY` | リポジトリ名（自動設定） | ✓ |

### カスタマイズ可能な項目

#### タスク名のフォーマット
`scripts/asana-integration.js` の100行目付近：
```javascript
name: `[${repositoryName}] ${issue.title}`
```

#### タスク説明文のフォーマット
```javascript
notes: `Repository: ${repositoryName}\nIssue #${issue.number}\n\n${issue.body || ''}\n\nGitHub Issue: ${issue.html_url}`
```

#### セクション配置ロジック
229行目付近の `targetSectionName` を変更することで、異なるセクションへの配置が可能

## 🛠️ 技術仕様

### 使用技術
- **言語**: Node.js (ES Modules)
- **CI/CD**: GitHub Actions
- **API**: Asana REST API v1.0
- **認証**: Bearer Token (Asana PAT)

### APIエンドポイント
- タスク作成: `POST /api/1.0/tasks`
- タスク更新: `PUT /api/1.0/tasks/{task_id}`
- タスク検索: `GET /api/1.0/projects/{project_id}/tasks`
- コメント追加: `POST /api/1.0/tasks/{task_id}/stories`
- セクション取得: `GET /api/1.0/projects/{project_id}/sections`
- セクション移動: `POST /api/1.0/sections/{section_id}/addTask`

### エラーハンドリング
- API呼び出しの失敗時は詳細なエラーメッセージを出力
- `continue-on-error: true` によりワークフロー全体の失敗を防止
- 各操作前に必要なオブジェクトの存在確認を実施

## ❗ 制限事項と注意点

### 制限事項
- Pull Requestに関連するコメントは同期対象外
- 既存のAsanaタスクとの重複チェックはリポジトリ名とIssue番号で実施
- Asana APIのレート制限（1分あたり150リクエスト）に注意

### 注意点
- セクション名は完全一致で検索されるため、スペースなども正確に設定する必要があります
- 初回実行時は既存のIssueは同期されません（新規作成分から対象）
- Asanaタスクの削除は自動では行われません
- 複数のGitHubリポジトリから同一のAsanaプロジェクトに連携する場合、リポジトリ名がプレフィックスとして付与されます

## 🤝 トラブルシューティング

### よくある問題と解決方法

#### タスクが作成されない
1. GitHub Actions の実行ログを確認
2. 必要な環境変数（Secrets）が正しく設定されているか確認
3. Asana PATの有効期限を確認

#### セクションにタスクが配置されない
- セクション名が完全に一致しているか確認（大文字小文字、スペースも含む）
- 指定したセクションがプロジェクト内に存在するか確認

#### APIエラーが発生する
- Asana PATの権限を確認（対象ワークスペース・プロジェクトへのアクセス権限）
- ワークスペースIDとプロジェクトIDが正しいか確認
- APIレート制限に達していないか確認

### デバッグ方法
1. GitHub Actions のログで詳細なエラーメッセージを確認
2. ローカル環境でテスト実行してデバッグ
3. `console.log` を追加して変数の内容を確認

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🙏 貢献

バグ報告、機能リクエスト、プルリクエストを歓迎します。

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成
