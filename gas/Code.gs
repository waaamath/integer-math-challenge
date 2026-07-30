/**
 * 整數加減過關－公開版學習紀錄
 *
 * 第一次使用：
 * 1. 建立一個全新的 Apps Script 專案並貼上本檔
 * 2. 執行 setup()，完成授權並取得新試算表網址
 * 3. 部署為網頁應用程式：執行身分「我」、存取權「任何人」
 * 4. 把 /exec 網址填入前端 app.js 的 RECORD_URL
 */

const SHEET_ID = "";
const SHEET_NAME = "學習紀錄";
const HEADERS = [
  "Session", "學生姓名", "班級", "上線時間", "結束時間", "狀態",
  "選擇關卡", "到達關卡", "總題數", "答錯數", "用時(秒)", "答對率", "錯題明細",
];

function getSheet_() {
  let spreadsheet;
  if (SHEET_ID) {
    spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  } else {
    const savedId = PropertiesService.getScriptProperties().getProperty("PUBLIC_MATH_SS_ID");
    if (savedId) {
      spreadsheet = SpreadsheetApp.openById(savedId);
    } else {
      spreadsheet = SpreadsheetApp.create("整數加減過關－公開版學習紀錄");
      PropertiesService.getScriptProperties().setProperty("PUBLIC_MATH_SS_ID", spreadsheet.getId());
    }
  }

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setBackground("#102B4E")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

function setup() {
  const sheet = getSheet_();
  Logger.log("公開版專用試算表：" + sheet.getParent().getUrl());
}

function findRow_(sheet, session) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !session) return -1;
  const sessions = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < sessions.length; index += 1) {
    if (String(sessions[index][0]) === String(session)) return index + 2;
  }
  return -1;
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    const data = JSON.parse(event.postData.contents);
    const sheet = getSheet_();

    if (data.action === "start") {
      sheet.appendRow([
        data.session || "",
        safeText_(data.學生姓名),
        safeText_(data.班級),
        data.上線時間 ? new Date(data.上線時間) : new Date(),
        "",
        "進行中",
        safeText_(data.選擇關卡),
        "", "", "", "", "", "",
      ]);
      return json_({ ok: true, phase: "start" });
    }

    const answered = Number(data.總題數) || 0;
    const wrong = Number(data.答錯數) || 0;
    const rate = answered ? Math.round(((answered - wrong) / answered) * 100) + "%" : "-";
    const wrongText = (Array.isArray(data.錯題) ? data.錯題 : [])
      .map((item) => `${item.題目} = ${item.正確答案}（輸入:${item.你的答案}）`)
      .join("\n");
    const endTime = data.結束時間 ? new Date(data.結束時間) : new Date();
    let row = findRow_(sheet, data.session);

    if (row === -1) {
      sheet.appendRow([
        data.session || "",
        safeText_(data.學生姓名),
        safeText_(data.班級),
        endTime,
        endTime,
        safeText_(data.完成) || "未通關",
        safeText_(data.選擇關卡),
        data.到達關卡 || "",
        answered,
        wrong,
        data.用時秒 || "",
        rate,
        wrongText,
      ]);
    } else {
      sheet.getRange(row, 2).setValue(safeText_(data.學生姓名));
      sheet.getRange(row, 3).setValue(safeText_(data.班級));
      sheet.getRange(row, 5).setValue(endTime);
      sheet.getRange(row, 6).setValue(safeText_(data.完成) || "未通關");
      sheet.getRange(row, 8).setValue(data.到達關卡 || "");
      sheet.getRange(row, 9).setValue(answered);
      sheet.getRange(row, 10).setValue(wrong);
      sheet.getRange(row, 11).setValue(data.用時秒 || "");
      sheet.getRange(row, 12).setValue(rate);
      sheet.getRange(row, 13).setValue(wrongText);
    }

    return json_({ ok: true, phase: "finish" });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function safeText_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("整數加減過關公開版－紀錄服務運作中");
}
