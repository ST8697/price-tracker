# 比價本（price-tracker）

記錄商品買過的最低價，看到團購時試算划不划算的手機 PWA。只有使用者自己用，資料存在裝置的 IndexedDB，沒有後端。

- 線上網址：https://st8697.github.io/price-tracker/（GitHub Pages，`main` 分支根目錄，push 後約 1–2 分鐘更新）
- Repo：https://github.com/ST8697/price-tracker（Public，GitHub Pages 免費版需要 Public）
- 使用者以繁體中文溝通，介面文字也用繁體中文

## 技術

- 純 HTML／CSS／JavaScript（ES modules），**不用框架、沒有 build 步驟**，刻意保持簡單好維護
- 本機測試：`node serve.mjs` → http://localhost:5173（ES modules 不能用 file:// 直接開）
- 內建瀏覽器（Claude Browser 面板）裡 Service Worker 會註冊失敗，是面板的限制；離線功能要在正式網址驗證

## 檔案

- `js/calc.js`：單位換算、單價、比價（純函式，不碰 DOM 或資料庫）
- `js/db.js`：IndexedDB 存取（stores：`categories`、`products`、`purchases`（有 `productId` 索引）、`meta`）
- `js/app.js`：hash 路由與所有畫面（`#/`、`#/calc?pid=`、`#/product/:id`、`#/product/:id/edit`、`#/product/new`、`#/purchase/:id`、`#/settings`、`#/backup`）
- `sw.js`：離線快取（stale-while-revalidate）。**新增、刪除或改名檔案時，要更新 `ASSETS` 清單並把 `CACHE` 版本號加一**；只改內容的話，使用者下次開啟就會拿到新版
- `css/style.css`：顏色都是 `:root` 的 CSS 變數，深色模式在 `prefers-color-scheme: dark` 裡覆寫

## 資料模型

- **分類** `{id, name, order}`：預設食、衣、住、行、育、樂，可以新增、改名、排序；還有商品的分類不能刪
- **商品** `{id, name, categoryId, brand, unitType, baseQty, countLabel, createdAt}`
  - `unitType`：`weight`（g/kg）、`volume`（ml/L）、`count`（自訂計數單位，例如 抽、片、顆）
  - **已經有購買紀錄的商品不能改 `unitType`**，否則單價無法互相比較
  - `baseQty`：單價基準，以最小單位儲存（weight/volume：100 或 1000；count：1、10、100）
  - 同一商品不同容量（例如 330ml 罐裝和 2L 瓶裝）算同一個商品，用單價比
- **購買紀錄** `{id, productId, date, store, specQty, specUnit, pieces, price, shipping, note, createdAt}`
  - 容量 = 每件規格 × 件數；kg→g、L→ml 自動換算
  - 買二送一這類優惠不另設欄位：填實付總價和實拿件數，在備註說明
- **meta**：`firstUse`、`lastBackup`、`lastReminder`（時間戳記）

## 核心規則

- **單價 =（價格 + 運費）÷ 總量 × 基準量**，顯示到小數第 2 位
- 「歷史最低」用單價判斷；同價時取日期較新的那筆。差距小於 $0.005 視為同價
- 商品頁顯示歷史最低（含日期、通路）和最近一次的單價
- 刪除商品時，底下的紀錄一起刪（刪除前都要確認）
- 備份提醒：有紀錄且超過 30 天沒備份就提醒（從沒備份時，從 `firstUse` 起算），「稍後」會延後 30 天

## 視覺設計

- App 名稱「比價本」，主色薄荷綠 `#0F6E56`（深色模式的填色用 `#158062`，文字用 `#5DCAA5`）
- 試算結果：**比最低價便宜用綠色（`--good`），比較貴用紅色（`--bad`）**。這兩個顏色和主色分開
- 排版：首頁最上面是「團購試算」大按鈕，接著是搜尋框、分類標籤、商品列表（右側大字顯示最低單價）；底部三個分頁：商品、試算、備份；分類管理在首頁右上角的設定
- 標準密度，最低單價是畫面上最醒目的數字；跟隨系統深色模式；版面最大寬度 560px

## 第一版刻意不做（之後可以考慮）

照片、價格走勢圖、多人雲端同步、掃條碼、子分類、自動抓網路價格
