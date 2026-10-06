# 比價本

記錄商品買過的最低價，看到團購時馬上試算划不划算。手機網頁 App（PWA），資料只存在你自己的裝置上。

## 功能

- **團購試算**：輸入團購的規格、價格、運費，自動換算單價，跟歷史最低價比較（便宜顯示綠色，比較貴顯示紅色），划算的話一鍵存檔
- **商品與購買紀錄**：一個商品底下有多筆購買紀錄（日期、通路／團主、規格 × 件數、價格、運費、備註）
- **單價換算**：單價 =（價格 + 運費）÷ 總量 × 基準量。kg→g、L→ml 自動換算；每個商品可以選基準（例如每 100g 或每 1kg）
- **分類**：預設食、衣、住、行、育、樂，可以在首頁右上角的設定裡新增、改名、排序
- **備份**：匯出／還原 JSON、匯出 Excel 用的 CSV；超過 30 天沒備份會提醒

## 在電腦上試用

需要 [Node.js](https://nodejs.org/)：

```bash
node serve.mjs
```

然後打開 http://localhost:5173

## 放到 GitHub Pages（手機使用）

1. 在 GitHub 建立一個新的 repository，例如 `price-tracker`
2. 把這個資料夾的檔案推上去：
   ```bash
   git init
   git add .
   git commit -m "比價本"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/price-tracker.git
   git push -u origin main
   ```
3. 到 repository 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，按 Save
4. 一兩分鐘後網址會是 `https://<你的帳號>.github.io/price-tracker/`
5. 用手機打開網址，加到主畫面：
   - **iPhone（Safari）**：分享按鈕 →「加入主畫面」
   - **Android（Chrome）**：右上角選單 →「安裝應用程式」或「加到主畫面」

程式碼是公開的，但你的購買資料只存在手機瀏覽器裡，不會上傳到任何地方。

## 注意

- 資料存在瀏覽器的 IndexedDB。**清除瀏覽器資料或換手機前，請先到「備份」分頁匯出 JSON**，之後在新裝置上用「從備份還原」匯入
- 在 iPhone 上，從主畫面開啟的 App 和 Safari 網頁的資料是分開的，請固定用主畫面的圖示開啟
- 更新程式後，App 會在背景下載新版，**下一次開啟**才會生效。如果改了檔案清單，記得修改 `sw.js` 裡的 `CACHE` 版本號

## 檔案結構

```
index.html             頁面骨架與底部分頁
css/style.css          樣式（淺色／深色模式）
js/app.js              畫面與互動
js/calc.js             單位換算、單價、比價計算
js/db.js               IndexedDB 存取
sw.js                  離線快取
manifest.webmanifest   PWA 設定（名稱、圖示、主題色）
icons/                 App 圖示
serve.mjs              本機測試用伺服器
```
