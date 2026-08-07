# 钱从四面八方来

React 18 + TypeScript 静态红绿观察台，默认通过东方财富公开网页接口获取实时行情和前复权日 K，在浏览器中计算日/周布林带与月线中轨，并使用 IndexedDB 保存个人数据。

## 本地运行

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。首次启动会加入 `00001.HK`（长和）作为验收样本，行情与指标不是硬编码数据。

## 验证与构建

```powershell
npm run typecheck
npm test
npm run verify:00001
npm run build
npm run build:single
```

标准静态目录输出到 `dist/`，单 HTML 便携版输出到 `dist-single/`。可靠的行情请求需要通过 localhost 或 HTTPS 静态站点访问；直接双击 HTML 是否可用取决于数据源对 `Origin: null` 的 CORS 策略。

东方财富接口属于公开网页接口，存在字段调整、限流和授权风险，只适合作为当前项目的开发验证数据源。正式使用前应确认数据展示和轮询许可，或通过 `MarketDataProvider` 接口换成已授权供应商。
