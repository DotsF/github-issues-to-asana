import https from 'https';
import fs from 'fs';

// 環境変数から設定を取得
const ASANA_PAT = process.env.ASANA_PAT;
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID;
const ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID;

// GitHub Context を読み込み関数で初期化
function loadGitHubContext() {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    console.log(`🔍 GITHUB_EVENT_PATH: ${eventPath}`);
    
    if (eventPath && fs.existsSync(eventPath)) {
      const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
      console.log(`✅ Event data loaded from: ${eventPath}`);
      return {
        event_name: process.env.GITHUB_EVENT_NAME,
        event: eventData
      };
    } else {
      console.log('⚠️ GITHUB_EVENT_PATH が存在しないか、ファイルが見つかりません');
      return {
        event_name: process.env.GITHUB_EVENT_NAME,
        event: {}
      };
    }
  } catch (error) {
    console.error('❌ GitHub Context の読み込みエラー:', error.message);
    return {
      event_name: process.env.GITHUB_EVENT_NAME,
      event: {}
    };
  }
}

// GitHub Context から情報を取得
const githubContext = loadGitHubContext();
const eventName = process.env.GITHUB_EVENT_NAME;
const eventPayload = githubContext.event || {};
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown';

/**
 * Asana API にHTTPリクエストを送信
 */
function makeAsanaRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'app.asana.com',
      port: 443,
      path: `/api/1.0${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${ASANA_PAT}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(new Error(`Asana API Error: ${res.statusCode} - ${responseData}`));
          }
        } catch (error) {
          reject(new Error(`JSON Parse Error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * GitHub Issue の情報からAsanaタスクを作成
 */
async function createAsanaTask(issue) {
  const taskData = {
    data: {
      name: `[${repositoryName}] ${issue.title}`,
      notes: `Repository: ${repositoryName}\nIssue #${issue.number}\n\n${issue.body || ''}\n\nGitHub Issue: ${issue.html_url}`,
      projects: [ASANA_PROJECT_ID],
      workspace: ASANA_WORKSPACE_ID,
      external: {
        gid: `github_issue_${repositoryName}_${issue.number}`,
        data: issue.html_url
      }
    }
  };


  try {
    const result = await makeAsanaRequest('POST', '/tasks', taskData);
    console.log(`✅ Asanaタスクを作成しました: ${result.data.gid}`);
    return result.data;
  } catch (error) {
    console.error('❌ Asanaタスク作成エラー:', error.message);
    throw error;
  }
}


/**
 * Asanaタスクを更新
 */
async function updateAsanaTask(taskId, updateData) {
  try {
    const result = await makeAsanaRequest('PUT', `/tasks/${taskId}`, { data: updateData });
    console.log(`✅ Asanaタスクを更新しました: ${taskId}`);
    return result.data;
  } catch (error) {
    console.error('❌ Asanaタスク更新エラー:', error.message);
    throw error;
  }
}

/**
 * GitHub IssueのIDからAsanaタスクを検索
 */
async function findAsanaTaskByIssue(issueNumber) {
  try {
    // プロジェクト内のタスクを検索
    const tasksResponse = await makeAsanaRequest('GET', `/projects/${ASANA_PROJECT_ID}/tasks`);
    
    // 各タスクの詳細を確認してGitHub Issue URLを含むものを探す
    for (const task of tasksResponse.data) {
      const taskDetail = await makeAsanaRequest('GET', `/tasks/${task.gid}`);
      if (taskDetail.data.notes && taskDetail.data.notes.includes(`Repository: ${repositoryName}`)) {
        const issueUrlPattern = new RegExp(`/issues/${issueNumber}$`);
        if (issueUrlPattern.test(taskDetail.data.notes)) {
          return taskDetail.data;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Asanaタスク検索エラー:', error.message);
    return null;
  }
}


/**
 * Asanaタスクにコメントを追加
 */
async function addCommentToAsanaTask(taskId, comment) {
  const storyData = {
    data: {
      text: comment,
      type: 'comment'
    }
  };

  try {
    const result = await makeAsanaRequest('POST', `/tasks/${taskId}/stories`, storyData);
    console.log(`✅ Asanaタスクにコメントを追加しました: ${taskId}`);
    return result.data;
  } catch (error) {
    console.error('❌ Asanaコメント追加エラー:', error.message);
    throw error;
  }
}

/**
 * Asanaプロジェクトのセクション一覧を取得
 */
async function getProjectSections() {
  try {
    const result = await makeAsanaRequest('GET', `/projects/${ASANA_PROJECT_ID}/sections`);
    console.log(`✅ プロジェクトセクションを取得しました: ${result.data.length}個`);
    return result.data;
  } catch (error) {
    console.error('❌ セクション取得エラー:', error.message);
    throw error;
  }
}

/**
 * セクション名からセクションIDを取得
 */
async function getSectionIdByName(sectionName) {
  const sections = await getProjectSections();
  const section = sections.find(s => s.name === sectionName);
  return section ? section.gid : null;
}

/**
 * Asanaタスクを指定したセクションに移動
 */
async function moveTaskToSection(taskId, sectionId) {
  try {
    const result = await makeAsanaRequest('POST', `/sections/${sectionId}/addTask`, {
      data: { task: taskId }
    });
    console.log(`✅ タスクをセクションに移動しました: ${taskId} → ${sectionId}`);
    return result.data;
  } catch (error) {
    console.error('❌ タスク移動エラー:', error.message);
    throw error;
  }
}

/**
 * タスクを指定したセクションに配置
 */
async function manageTaskSection(taskId, issueAction) {
  // 全てのIssueを指定したセクションに配置
  const targetSectionName = process.env.ASANA_SECTION;
  
  console.log(`📋 タスクを「${targetSectionName}」セクションに配置します: ${taskId}`);

  const sectionId = await getSectionIdByName(targetSectionName);
  if (!sectionId) {
    console.error(`❌ セクション "${targetSectionName}" が見つかりません`);
    return;
  }

  await moveTaskToSection(taskId, sectionId);
}

/**
 * メイン処理
 */
async function main() {
  console.log(`🚀 GitHub Event: ${eventName}`);

  // 必要な環境変数をチェック
  if (!ASANA_PAT || !ASANA_WORKSPACE_ID || !ASANA_PROJECT_ID || !ASANA_SECTION) {
    console.error('❌ 必要な環境変数が設定されていません:');
    console.error('  - ASANA_PAT');
    console.error('  - ASANA_WORKSPACE_ID');
    console.error('  - ASANA_PROJECT_ID');
    console.error('  - ASANA_SECTION');
    process.exit(1);
  }


  try {
    // デバッグ用にeventPayloadの内容を出力
    console.log('🔍 Event Payload:', JSON.stringify(eventPayload, null, 2));

    if (eventName === 'issues') {
      const action = eventPayload.action;
      const issue = eventPayload.issue;

      console.log(`📝 Issue Action: ${action}`);
      
      // issueオブジェクトの存在チェック
      if (!issue) {
        console.error('❌ Issue オブジェクトが見つかりません。eventPayload:', eventPayload);
        process.exit(1);
      }

      // actionの存在チェック
      if (!action) {
        console.error('❌ Action が見つかりません。eventPayload:', eventPayload);
        process.exit(1);
      }

      console.log(`📄 Issue: #${issue.number} - ${issue.title}`);

      if (action === 'opened') {
        // 新しいIssueの場合、Asanaタスクを作成
        const asanaTask = await createAsanaTask(issue);
        if (asanaTask) {
          // タスクを「frontend」セクションに配置
          await manageTaskSection(asanaTask.gid, 'opened');
        }
      } else if (action === 'closed') {
        // Issueが閉じられた場合、Asanaタスクを完了にする
        const asanaTask = await findAsanaTaskByIssue(issue.number);
        if (asanaTask) {
          await updateAsanaTask(asanaTask.gid, { completed: true });
          // タスクは「frontend」セクションに残す（移動なし）
        }
      } else if (action === 'reopened') {
        // Issueが再オープンされた場合、Asanaタスクを未完了にする
        const asanaTask = await findAsanaTaskByIssue(issue.number);
        if (asanaTask) {
          await updateAsanaTask(asanaTask.gid, { completed: false });
          // タスクは「frontend」セクションに残す（移動なし）
        }
      }
    } else if (eventName === 'issue_comment') {
      const action = eventPayload.action;
      const issue = eventPayload.issue;
      const comment = eventPayload.comment;

      // issueオブジェクトの存在チェック
      if (!issue) {
        console.error('❌ Issue オブジェクトが見つかりません（issue_comment）。eventPayload:', eventPayload);
        process.exit(1);
      }

      // commentオブジェクトの存在チェック
      if (!comment) {
        console.error('❌ Comment オブジェクトが見つかりません。eventPayload:', eventPayload);
        process.exit(1);
      }

      // Pull Requestのコメントは除外（issue.pull_requestが存在する場合はPR）
      if (issue.pull_request) {
        console.log(`⏭️  Pull Requestのコメントのためスキップ: PR #${issue.number}`);
        return;
      }

      if (action === 'created') {
        console.log(`💬 新しいコメント on Issue #${issue.number}`);
        
        // 対応するAsanaタスクを検索
        const asanaTask = await findAsanaTaskByIssue(issue.number);
        if (asanaTask) {
          const commentText = `[${repositoryName}] GitHub コメント by ${comment.user.login}:\n${comment.body}`;
          await addCommentToAsanaTask(asanaTask.gid, commentText);
          // タスクは「frontend」セクションに残す（移動なし）
        }
      }
    } else {
      console.log(`⚠️ 対応していないイベント: ${eventName}`);
      console.log('🔍 利用可能なイベント: issues, issue_comment');
    }

    console.log('✅ 処理が完了しました');
  } catch (error) {
    console.error('❌ 処理中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}


main().catch(console.error);