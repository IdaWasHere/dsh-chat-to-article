# 对话成文 · DeepSeek Harness 插件

针对 DeepSeek Harness 0.2.1-rc.3 桌面版和 Web 版开发。插件直接在聊天消息选区旁显示“标记重点”和“排除内容”，右下角“对话成文”按钮打开文章面板。

## 安装

在 **插件 → 添加插件** 中输入 `github:IdaWasHere/dsh-chat-to-article`，或使用命令行：

```sh
dsh plugin --profile desktop add github:IdaWasHere/dsh-chat-to-article
```

Web 版将 `desktop` 改为 `web`。安装前请检查源码；本插件并非 DeepSeek 官方插件。

在 DeepSeek Harness 中打开 **插件 → 添加插件**，选择本地目录，输入本文件夹的绝对路径。安装或更新后按应用提示重载插件或重启应用。命令行 profile 也可在本文件夹的上级目录执行：

```sh
dsh plugin --profile web add ./dsh-chat-to-article
```

桌面版请优先通过应用内的插件页面安装到 `desktop` profile。

## 使用

1. 打开一个会话，选中已经显示的用户或助手消息文字，点击浮出的“标记重点”或“排除内容”。标记按会话 ID 保存在此设备的浏览器本地存储。
2. 打开右下角“对话成文”，可查看和移除标记。
3. 选择 OpenAI 或 DeepSeek、填写该服务商的模型与 API Key，保存配置并测试连接。两家服务商的配置分别保存；Key 保存在本机 DSH Host 的 `~/.dsh/chat-to-article/settings.json`（或 `$DSH_HOME/chat-to-article/settings.json`），面板只显示是否已保存。
4. 点击“生成文章”。插件读取当前聊天页面已经加载的文本消息；历史消息未加载时，先在聊天里加载。排除原文会先从所有消息中删除，再发送给所选模型。重点原文会作为必需内容发送。
5. 生成结果逐字检查：遗漏任一重点原文或包含任一排除原文会被拦截。可直接编辑通过检查的 Markdown，然后复制或下载 `.md` 文件。

标记所指消息如果变化、消失，或生成期间页面消息及标记改变，结果不会显示。修改标记后可重新生成。逐字检查无法判断语义相近的改写；编辑文章后请自行检查最终稿。

## 文件

- `index.js`：Host API、配置保存、模型请求与安全校验。
- `client.js`：聊天选区浮层、会话标记和文章面板。
- `cordis.patch.yml`：Harness 插件层。
- `package.json`：安装清单。

插件只在点击“测试连接”或“生成文章”时向选定服务商发送请求。生成文章时，API Key 作为 Host 侧 Authorization 请求头发送，浏览器前端不会读回 Key。

## 隐私与限制

仓库不包含 API Key 或私人对话。生成时会将当前已加载的对话（删除排除原文后）发送给所选的 OpenAI 或 DeepSeek 服务。标记及其对应的整条消息保存在本机浏览器 localStorage；模型配置及 API Key 保存在本机 DSH Host 的 JSON 文件中，未加密，写入权限为仅当前用户读写。移除标记可删除该条本地标记记录；编辑后的文章不会重新自动检查。

逐字检查无法识别同义改写。仅使用当前页面已加载的文本，不包含未加载历史。本插件以 DSH 进程权限运行。
