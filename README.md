# Study Sidekick

一个 浏览器 插件：识别网页中的选择题，并在题目前序号前显示选项答案。

## 文件结构

```text
Chrome Extension
├── content.js      读取网页题目文本并注入“AI 解析”按钮
├── content.css     网页内按钮和答案标签样式
├── popup.html      插件按钮界面
├── popup.js        保存 AI 接口配置
├── sidebar.html    Chrome 原生侧边栏配置界面
├── sidebar.js      保存 DeepSeek 接口配置
├── background.js   调用 DeepSeek AI 接口
└── manifest.json   插件配置
```

## 安装

  1. 打开 Chrome：`chrome://extensions/`
   2. 开启右上角“开发者模式”
    3. 点击“加载已解压的扩展程序”
     4. 选择本目录：`C:\Users\admin\OneDrive\文档\识别软件`

## 使用

      1. 打开包含题目的网页。
       2. 题目旁会出现“AI 解析”按钮。
        3. 点击后，按钮旁会显示类似 `答案：D` 的选项答案。
4. 点击浏览器插件图标或右侧栏“接口设置”，可配置 DeepSeek 接口地址、模型和 API Key。

推荐配置：

```text
接口地址：https://api.deepseek.com/chat/completions
模型：deepseek-v4-flash
API Key：你的 DeepSeek API Key
```

未配置 API Key 时，插件不会调用 AI，只会提示需要配置。

## 说明

这个插件只在页面上显示参考选项，不会自动填写、提交答案，也不会绕过课程或考试平台限制。
