# mineo API 仕様書

> [!CAUTION]
> 以下のAPIはすべて**非公開API**であり、予告なく仕様が変更される可能性がある。個人的な研究・実験目的での利用に留め、過度なアクセスは控えること。

**出典**: [mineoアプリ API仕様 | みぃるんにっき](https://blog.3irun.moe/2025/11/29/mineo_api_document/)

---

## 1. 共通仕様

### Base URL

```
https://api.eonet.jp/mineo/v1/
```

### 共通ヘッダー

| ヘッダー        | 値                             | 備考               |
| --------------- | ------------------------------ | ------------------ |
| `appId`         | アプリID（例: `TEST`）         |                    |
| `appVersion`    | アプリバージョン（例: `1.0.0`）|                    |
| `Authorization` | `Bearer <id_token>`            | 有効期限: 24時間   |
| `aid`           | AID（例: `TEST`）              |                    |

### 共通ボディパラメータ

`Get Telnum List` を除く全APIで、`application/x-www-form-urlencoded` 形式で `custId` を指定する必要がある。

| パラメータ | 型     | 説明             | 例            |
| ---------- | ------ | ---------------- | ------------- |
| `custId`   | string | 回線固有の顧客ID | `ABC12DE345`  |

### 共通エラーレスポンス

| resultCode | メッセージ                                               | 原因                  |
| ---------- | -------------------------------------------------------- | --------------------- |
| `0098`     | システムエラー。時間をおいてから再度お試しください。       | パラメータ不足        |
| `0022`     | 認証エラー。ログアウト後、再ログインしてください。         | 存在しない`custId`    |
| `401`      | `{"statusCode": 401, "message": "Invalid JWT."}`         | 不正なAuthorization   |

---

## 2. 認証 (Authorization)

### Token Refresh

Authorizationの有効期限が切れた場合、リフレッシュトークンで更新可能。

**URL**: `POST https://login.eonet.jp/oidc/v1/token`

**リフレッシュトークン取得方法**: mineoアプリをログアウト→ログインし、mitmproxy等で上記URLをパケットキャプチャ。

**リクエスト** (`application/x-www-form-urlencoded`):

| パラメータ      | 値                         | 備考           |
| --------------- | -------------------------- | -------------- |
| `grant_type`    | `refresh_token`            | 固定値         |
| `refresh_token` | `TOKEN`                    | 取得したトークン |
| `client_id`     | `100064798`                | 固定値         |

**成功レスポンス**:

```json
{
  "access_token": "xxE05YhIxMdoJmY......",
  "expires_in": "86400",
  "id_token": "eyJhbGciOiJSUzI1NiIs......",
  "refresh_token": "VEweVyQQCzmTwPmBXd......",
  "token_type": "Bearer"
}
```

> [!IMPORTANT]
> - `id_token` → ヘッダーの `Authorization` パラメータに使用
> - `refresh_token` → トークンの再更新に使用（**1回限り有効**）
> - `refresh_token` の有効期限は `id_token` より長い
> - リフレッシュ後も古いトークンは期限まで引き続き使用可能

**エラーレスポンス**:

```json
{
  "error": "invalid_token",
  "error_description": "refresh token is not exists"
}
```

---

## 3. 回線関係

### 3.1 Get Telnum List

eoIDで契約している回線の一覧を取得。**`custId` 不要**。

| 項目     | 値                                                   |
| -------- | ---------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_telnum_list` |
| Body     | なし（`custId`不要）                                  |

**成功レスポンス**:

```json
{
  "messages": [null],
  "resultCode": "00",
  "telNumList": [
    {
      "custId": "ABC12DE345",
      "lineName": "iPhone",
      "telNum": "080XXXXXXXX"
    }
  ]
}
```

| フィールド              | 型     | 説明           |
| ----------------------- | ------ | -------------- |
| `telNumList[].custId`   | string | 顧客ID         |
| `telNumList[].lineName` | string | 回線名称       |
| `telNumList[].telNum`   | string | 電話番号       |

---

### 3.2 Get Line Name

契約回線に設定した回線名称を取得する。

| 項目     | 値                                                  |
| -------- | --------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_line_name`  |
| Body     | `custId`                                             |

**成功レスポンス**:

```json
{
  "lineName": "iPhone",
  "messages": [null],
  "resultCode": "00"
}
```

---

## 4. パケット関係

### 4.1 Get Capacity

契約回線のパケット使用量・残量を確認。

| 項目     | 値                                                  |
| -------- | --------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_capacity`   |
| Body     | `custId`                                             |

**成功レスポンス**:

```json
{
  "lowSpeedDisp": null,
  "messages": [null],
  "mySokuFlg": "0",
  "packetInfo": {
    "baseCapacity": 5120,
    "baseRemainingCapacity": 5120,
    "chargeCapacity": 0,
    "chargeRemainingCapacity": 0,
    "forwardCapacity": 67254,
    "forwardRemainingCapacity": 33563,
    "giftCapacity": 0,
    "giftRemainingCapacity": 0
  },
  "resultCode": "00",
  "serviceName": "Dプラン デュアルタイプ (5GB)",
  "speedFlg": "1",
  "tushinSettingStatusCode": "00"
}
```

| フィールド                            | 型     | 説明                                                     |
| ------------------------------------- | ------ | -------------------------------------------------------- |
| `lowSpeedDisp`                        | string | mineoスイッチON時 → `"通信速度最大200kbps適用中"`         |
| `mySokuFlg`                           | string | `0`: マイそくOFF / `1`: マイそくON                       |
| `packetInfo.baseCapacity`             | number | 基本データ容量 (MB)                                      |
| `packetInfo.baseRemainingCapacity`    | number | 残り基本データ容量 (MB)                                  |
| `packetInfo.chargeCapacity`           | number | チャージ容量 (MB)                                        |
| `packetInfo.chargeRemainingCapacity`  | number | 残りチャージ容量 (MB)                                    |
| `packetInfo.forwardCapacity`          | number | 前月繰り越し容量 (MB)                                    |
| `packetInfo.forwardRemainingCapacity` | number | 残り前月繰り越し容量 (MB)                                |
| `packetInfo.giftCapacity`             | number | ギフト容量 (MB)                                          |
| `packetInfo.giftRemainingCapacity`    | number | 残りギフト容量 (MB)                                      |
| `speedFlg`                            | string | `0`: mineoスイッチON / `1`: mineoスイッチOFF             |
| `tushinSettingStatusCode`             | string | `00`: mineoスイッチOFF / `01`: mineoスイッチON           |

---

### 4.2 Get Capacity For Gift

パケットギフトのギフト可能容量を確認。

| 項目     | 値                                                           |
| -------- | ------------------------------------------------------------ |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_capacity_for_gift`   |
| Body     | `custId`                                                      |

**成功レスポンス**:

```json
{
  "capacityForGift": 40918,
  "messages": [null],
  "resultCode": "00"
}
```

| フィールド        | 型     | 説明                |
| ----------------- | ------ | ------------------- |
| `capacityForGift` | number | ギフト可能容量 (MB) |

---

### 4.3 Change Gift

発行済みパケットギフトを受け取る。

| 項目     | 値                                                   |
| -------- | ---------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/change_gift`     |
| Body     | `custId`, `giftCode`                                  |

**追加パラメータ**:

| パラメータ  | 型     | 説明               | 例          |
| ----------- | ------ | ------------------ | ----------- |
| `giftCode`  | string | パケットギフトコード | `ABCD1234`  |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "giftCapacity": 10
}
```

**固有エラー**:

| resultCode | 説明                                               |
| ---------- | -------------------------------------------------- |
| `0056`     | 発行元と受取先が同一                                |
| `0051`     | ギフトコードが存在しない                            |

---

### 4.4 Issue Gift

パケットギフトを発行する。

| 項目     | 値                                                 |
| -------- | -------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/issue_gift`    |
| Body     | `custId`, `giftCapacity`                            |

**追加パラメータ**:

| パラメータ     | 型     | 説明                  | 範囲       |
| -------------- | ------ | --------------------- | ---------- |
| `giftCapacity` | number | ギフト容量 (MB)       | 10～9999   |

**成功レスポンス**:

```json
{
  "expireDate": "20240727",
  "giftCapacity": 1000,
  "giftCode": "ABCD1234",
  "messages": [null],
  "resultCode": "00"
}
```

| フィールド     | 型     | 説明                     |
| -------------- | ------ | ------------------------ |
| `expireDate`   | string | 有効期限 (`yyyyMMdd`)    |
| `giftCapacity` | number | ギフト容量 (MB)          |
| `giftCode`     | string | ギフトコード             |

**固有エラー**:

| resultCode | 説明                                 |
| ---------- | ------------------------------------ |
| `0064`     | ギフト可能容量を超過                  |

---

### 4.5 Get Packetcharge Info

パケットチャージに関する情報を取得。

| 項目     | 値                                                            |
| -------- | ------------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_packetcharge_info`    |
| Body     | `custId`                                                       |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "packetChargeInfo": {
    "chargeCapacity": 100,
    "chargeUnitCapacity": 100,
    "chargeUnitPriceYen": 55,
    "chargeLimitCapacity": 15000,
    "chargeTotalCapacity": 100,
    "chargeExpireDate": "20251231"
  },
  "packetChargeKanryoHistList": [
    {
      "compTime": "202511300247",
      "chargeAmount": "100"
    }
  ]
}
```

| フィールド                                   | 型     | 説明                              |
| -------------------------------------------- | ------ | --------------------------------- |
| `packetChargeInfo.chargeCapacity`            | number | チャージ容量残量 (MB)             |
| `packetChargeInfo.chargeUnitCapacity`        | number | チャージ単位 (MB)                 |
| `packetChargeInfo.chargeUnitPriceYen`        | number | チャージ単位料金（円）            |
| `packetChargeInfo.chargeLimitCapacity`       | number | 月チャージ容量上限 (MB)           |
| `packetChargeInfo.chargeTotalCapacity`       | number | 月チャージ総量 (MB)               |
| `packetChargeInfo.chargeExpireDate`          | string | 有効期限 (`yyyyMMdd`)             |
| `packetChargeKanryoHistList[].compTime`      | string | チャージ完了日時 (`yyyyMMddHHmm`) |
| `packetChargeKanryoHistList[].chargeAmount`  | string | チャージ容量                      |

---

### 4.6 Charge Packet

パケットチャージを実行する。

> [!WARNING]
> 実行するとチャージ分の料金が**実際に請求**される。使用は非推奨。

| 項目     | 値                                                    |
| -------- | ----------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/charge_packet`    |
| Body     | `custId`, `chargeCount`                                |

**追加パラメータ**:

| パラメータ    | 型     | 説明                        | 範囲  |
| ------------- | ------ | --------------------------- | ----- |
| `chargeCount` | number | チャージ口数 (1口=100MB,55円) | 1～10 |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null]
}
```

**固有エラー**:

| resultCode | 説明                  |
| ---------- | --------------------- |
| `0099`     | 範囲外のchargeCount   |

---

### 4.7 Get Packetshare Info

パケットシェアメンバー情報を取得する。

| 項目     | 値                                                           |
| -------- | ------------------------------------------------------------ |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_packetshare_info`    |
| Body     | `custId`                                                      |

**成功レスポンス** (調査中):

```json
{
  "resultCode": "03",
  "messages": [null],
  "packetshareList": null
}
```

---

## 5. ゆずるね。関係

### 5.1 Declare Devolve

「ゆずるね。」宣言を行う。

| 項目     | 値                                                      |
| -------- | ------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/declare_devolve`    |
| Body     | `custId`                                                 |

**成功レスポンス**:

```json
// 宣言完了
{ "resultCode": "00", "messages": [null] }

// 既に宣言済み
{ "resultCode": "05", "messages": [null] }
```

**固有エラー**:

| resultCode | 説明                                                     |
| ---------- | -------------------------------------------------------- |
| `0061`     | 宣言受付時間外（11:30～12:59は宣言不可。13時以降に可能） |

---

### 5.2 Get Devolve Declare Stat

「ゆずるね。」の宣言状況を取得する。

| 項目     | 値                                                                |
| -------- | ----------------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_devolve_declare_stat`     |
| Body     | `custId`                                                           |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "devolveDeclareStat": "1",
  "devolveDeclareAcceptability": "1"
}
```

| フィールド                   | 型     | 説明                                              |
| ---------------------------- | ------ | ------------------------------------------------- |
| `devolveDeclareStat`         | string | `0`: 宣言待ち / `1`: 宣言済み                    |
| `devolveDeclareAcceptability`| string | `0`: 未宣言 / `1`: 宣言済み / `2`: 宣言受付時間外 |

---

### 5.3 Get Devolve Declare Hist Thismonth

ゆずるね。の達成状況・特典状況を取得する。

| 項目     | 値                                                                             |
| -------- | ------------------------------------------------------------------------------ |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_devolve_declare_hist_thismonth`        |
| Body     | `custId`                                                                        |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "nengetsu": "202512",
  "successCntAmount": 2,
  "devolveDeclareHistList": [
    {
      "histDate": "20251201",
      "devolveSeihiStat": "1",
      "packetTraffic": 389,
      "devolveStampFlg": "1"
    }
  ],
  "devolveTokutenMstList": [
    { "devolveTokutenName": "100MB", "requiredStamps": 5 },
    { "devolveTokutenName": "ゆずるね。深夜フリー特典", "requiredStamps": 10 },
    { "devolveTokutenName": "200MB", "requiredStamps": 15 },
    { "devolveTokutenName": "契約容量パケット", "requiredStamps": 20 }
  ]
}
```

| フィールド                                    | 型     | 説明                                                  |
| --------------------------------------------- | ------ | ----------------------------------------------------- |
| `nengetsu`                                    | string | 対象年月 (`yyyyMM`)                                   |
| `successCntAmount`                            | number | 達成回数                                              |
| `devolveDeclareHistList[].histDate`           | string | 日付 (`yyyyMMdd`)                                     |
| `devolveDeclareHistList[].devolveSeihiStat`   | string | `0`: 宣言のみ / `1`: 達成                             |
| `devolveDeclareHistList[].packetTraffic`      | number | ゆずるね。時間中の通信量 (KB)                         |
| `devolveDeclareHistList[].devolveStampFlg`    | string | スタンプが押されたか                                  |
| `devolveTokutenMstList[].devolveTokutenName`  | string | 特典内容                                              |
| `devolveTokutenMstList[].requiredStamps`      | number | 必要スタンプ数                                        |

---

## 6. パスケット関係

### 6.1 Get My Tank

パスケットの残容量などの情報を取得する。

| 項目     | 値                                                  |
| -------- | --------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_my_tank`    |
| Body     | `custId`                                             |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "myTankCapacity": 1024,
  "pasketInRemainingCapacity": 101376,
  "pasketInMonthlyLimitCapacity": 102400,
  "displayMessages1": null,
  "displayMessages2": "10～102,400MBの範囲で入力してください。",
  "displayMessages3": "10～1,048,576MBの範囲で入力してください。",
  "displayMessages4": "１か月でパスケットに入れられるパケットの合計は102,400MBまでとなります。"
}
```

| フィールド                     | 型     | 説明                             |
| ------------------------------ | ------ | -------------------------------- |
| `myTankCapacity`               | number | パスケット残容量 (MB)            |
| `pasketInRemainingCapacity`    | number | 月間パスケットIN残り容量 (MB)    |
| `pasketInMonthlyLimitCapacity` | number | 月間パスケットIN上限容量 (MB)    |

**固有エラー**:

| resultCode | 説明             |
| ---------- | ---------------- |
| `0086`     | パスケット未契約 |

---

### 6.2 Get My Tank History

パスケットの過去3ヶ月の明細を確認する。

| 項目     | 値                                                          |
| -------- | ----------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_my_tank_history`    |
| Body     | `custId`                                                     |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "monthlyMyTankHistoryList": [
    {
      "targetMonth": "12",
      "sumInfo": {
        "targetDay": null,
        "inPacketCapacity": null,
        "outPacketCapacity": null
      },
      "dailyMyTankHistoryList": [
        {
          "targetDay": "1",
          "inPacketCapacity": null,
          "outPacketCapacity": null
        }
      ]
    }
  ],
  "notes": null
}
```

| フィールド                                        | 型     | 説明            |
| ------------------------------------------------- | ------ | --------------- |
| `monthlyMyTankHistoryList[].targetMonth`          | string | 対象月          |
| `monthlyMyTankHistoryList[].sumInfo`              | object | 月合計          |
| `dailyMyTankHistoryList[].targetDay`              | string | 日にち          |
| `dailyMyTankHistoryList[].inPacketCapacity`       | number | IN (MB)         |
| `dailyMyTankHistoryList[].outPacketCapacity`      | number | OUT (MB)        |

---

### 6.3 My Tank In

パスケットにパケットを入れる。

| 項目     | 値                                                 |
| -------- | -------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/my_tank_in`    |
| Body     | `custId`, `inCapacity`                              |

**追加パラメータ**:

| パラメータ   | 型     | 説明                   | 範囲         |
| ------------ | ------ | ---------------------- | ------------ |
| `inCapacity` | number | 入れるパケット量 (MB)  | 10～102400   |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "myTankCapacity": 1124,
  "completionNotes": "反映までに時間がかかる場合があります"
}
```

**固有エラー**:

| resultCode | 説明                                          |
| ---------- | --------------------------------------------- |
| `0080`     | 10MB未満                                      |
| `0081`     | 最大容量超過                                  |
| `0082`     | パケット残容量を超過                          |
| `0086`     | パスケット未契約                              |

---

### 6.4 My Tank Out

パスケットからパケットを引き出す。

| 項目     | 値                                                 |
| -------- | -------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/my_tank_out`   |
| Body     | `custId`, `outCapacity`                             |

**追加パラメータ**:

| パラメータ    | 型     | 説明                    | 範囲          |
| ------------- | ------ | ----------------------- | ------------- |
| `outCapacity` | number | 引き出すパケット量 (MB) | 10～1048576   |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "myTankCapacity": 1024,
  "completionNotes": "反映までに時間がかかる場合があります"
}
```

**固有エラー**:

| resultCode | 説明                          |
| ---------- | ----------------------------- |
| `0080`     | 10MB未満                      |
| `0081`     | 最大容量超過                  |
| `0083`     | パスケット残容量を超過        |
| `0086`     | パスケット未契約              |

---

### 6.5 Get Pasket Auto Out

パスケットのオートOUT設定を取得する。

| 項目     | 値                                                          |
| -------- | ----------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_pasket_auto_out`    |
| Body     | `custId`                                                     |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "autoOutSize": 100,
  "displayAttentionWordList": [
    { "attentionWord": "※現在の設定から上書きされます。" },
    { "attentionWord": "※100MB～1,048,576MBの範囲で設定してください。" },
    { "attentionWord": "※パスケットの残容量が、設定されたオートOUT容量以下の場合、オートOUTは実施されません。" },
    { "attentionWord": "※障害、メンテナンス時、または残容量の計算タイミングによってはオートOUTが実施されない場合があります。" }
  ]
}
```

| フィールド    | 型     | 説明                      |
| ------------- | ------ | ------------------------- |
| `autoOutSize` | number | オートOUTするパケット (MB)|

---

### 6.6 Set Pasket Auto Out

パスケットのオートOUTを設定する。

| 項目     | 値                                                          |
| -------- | ----------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/set_pasket_auto_out`    |
| Body     | `custId`, `autoOutSet`, `autoOutSize`                        |

**追加パラメータ**:

| パラメータ    | 型     | 説明                              | 範囲           |
| ------------- | ------ | --------------------------------- | -------------- |
| `autoOutSet`  | number | オートOUT設定 (`0`: 無効 / それ以外: 有効) |                |
| `autoOutSize` | number | オートOUTする容量 (MB)            | 100～1048576   |

> [!WARNING]
> `autoOutSet` を 0,1 以外の値に設定すると、レスポンスの `autoOutSize` が `null` と表示されるほか、範囲外の `autoOutSize` でも設定できてしまう問題がある（想定外の動作になる可能性あり）。

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "autoOutSize": 100
}
```

---

## 7. その他機能

### 7.1 Change Speed

mineoスイッチのON/OFFを切り替える。

| 項目     | 値                                                   |
| -------- | ---------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/change_speed`    |
| Body     | `custId`, `speedFlg`                                  |

**追加パラメータ**:

| パラメータ | 型     | 説明                                  |
| ---------- | ------ | ------------------------------------- |
| `speedFlg` | string | `0`: スイッチON / `1`: スイッチOFF    |

**成功レスポンス**:

```json
{ "messages": [null], "resultCode": "00" }
```

**固有エラー**:

| resultCode | 説明                              |
| ---------- | --------------------------------- |
| `0025`     | クールダウン中（1分間）に再実行   |

---

### 7.2 Get Speed Info

mineoスイッチ自動節約設定のスケジュールを取得する。

| 項目     | 値                                                    |
| -------- | ----------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_speed_info`   |
| Body     | `custId`                                               |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "speedChangeSettingList": [
    {
      "execYobiKbn": "2",
      "execTime": "0400",
      "changeOnOffKbn": "0"
    }
  ]
}
```

| フィールド      | 型     | 説明                                  |
| --------------- | ------ | ------------------------------------- |
| `execYobiKbn`   | string | 設定曜日（`1`～`7` → 日～土）         |
| `execTime`      | string | 設定時刻 (`HHmm`)                     |
| `changeOnOffKbn`| string | `0`: 節約ON / `1`: 節約OFF            |

> [!NOTE]
> 設定がない場合は `speedChangeSettingList` が `null` になる。

---

### 7.3 Get Traffic History

過去3ヶ月分のデータ通信量、パケットギフト、マイネ王からのパケットの出入りを確認。

| 項目     | 値                                                          |
| -------- | ----------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_traffic_history`    |
| Body     | `custId`                                                     |

**成功レスポンス**:

```json
{
  "messages": [null],
  "resultCode": "00",
  "monthlyTrafficHistoryList": [
    {
      "targetMonth": "5",
      "averageInfo": { ... },
      "sumInfo": { ... },
      "dailyTrafficHistoryList": [ ... ]
    }
  ]
}
```

**通信量オブジェクトのフィールド** (`averageInfo` / `sumInfo` / `dailyTrafficHistoryList[]`):

| フィールド                 | 型     | 説明                                   |
| -------------------------- | ------ | -------------------------------------- |
| `dataTraffic`              | number | データ通信量 合計 (MB)                 |
| `dataTrafficAdCountFree`   | number | データ通信量 広告フリー (MB)           |
| `dataTrafficHighSpeed`     | number | データ通信量 高速 (MB)                 |
| `dataTrafficLowSpeed`      | number | データ通信量 低速/mineoスイッチON (MB) |
| `decreaseFreeTank`         | number | フリータンクIN・チップ贈呈 (MB)        |
| `decreasePacketGift`       | number | 発行したパケットギフト (MB)            |
| `increaseFreeTank`         | number | フリータンクOUT・チップ受取 (MB)       |
| `increasePacketGift`       | number | 受け取ったパケットギフト (MB)          |
| `targetDay`                | string | 日にち（`sumInfo`では常に`null`）      |

---

### 7.4 Login Stamp

ログインスタンプの獲得・特典内容を確認する。

| 項目     | 値                                                  |
| -------- | --------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/login_stamp`    |
| Body     | `custId`, `updateMode`                               |

**追加パラメータ**:

| パラメータ   | 型     | 説明                                                   |
| ------------ | ------ | ------------------------------------------------------ |
| `updateMode` | number | `0`: スタンプ獲得しない / `1`: 初回ログイン時に獲得    |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "stampCnt": 155,
  "updateFlg": "0",
  "tokutenList": [
    {
      "id": "LS00000001",
      "name": "100MB",
      "requiredStamps": 20,
      "getFlg": "0"
    },
    {
      "id": "LS00000002",
      "name": "王国コイン",
      "requiredStamps": 100,
      "getFlg": "0"
    }
  ]
}
```

| フィールド                  | 型     | 説明                                        |
| --------------------------- | ------ | ------------------------------------------- |
| `stampCnt`                  | number | 累計スタンプカウント                        |
| `updateFlg`                 | string | `0`: 何もしない / `1`: スタンプを獲得した   |
| `tokutenList[].id`          | string | 特典ID                                      |
| `tokutenList[].name`        | string | 特典内容                                    |
| `tokutenList[].requiredStamps` | number | 必要スタンプ数                           |
| `tokutenList[].getFlg`      | string | `0`: 何もしない / `1`: 特典を獲得した       |

---

### 7.5 Get Video Ad Info

広告視聴パケットの獲得状況を確認する。

| 項目     | 値                                                       |
| -------- | -------------------------------------------------------- |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_video_ad_info`   |
| Body     | `custId`                                                  |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "viewCount": 2,
  "rewardPacketAmount": 1,
  "limitViewCount": 15
}
```

| フィールド           | 型     | 説明                        |
| -------------------- | ------ | --------------------------- |
| `viewCount`          | number | 視聴回数                    |
| `rewardPacketAmount` | number | 広告視聴によるパケット報酬 (MB)|
| `limitViewCount`     | number | 日あたり視聴上限             |

---

### 7.6 Get Syokai Info

紹介アンバサダー制度の情報を取得する。

| 項目     | 値                                                     |
| -------- | ------------------------------------------------------ |
| URL      | `POST https://api.eonet.jp/mineo/v1/get_syokai_info`   |
| Body     | `custId`                                                |

**成功レスポンス**:

```json
{
  "resultCode": "00",
  "messages": [null],
  "syokaiCnt": 0,
  "syokaiTokutenCompleteCnt": 0,
  "syokaiTokutenWaitCnt": 0,
  "syokaiTokutenExpiredCnt": 0,
  "syokaiUrl": "https://mineo.jp/syokai/?jrp=syokai&kyb=Y3Y3C0W1D0",
  "syokaiAmbassadorRank": "01",
  "syokaiAmbassadorRankName": "ブロンズ",
  "cntToNextRank": 1
}
```

| フィールド                  | 型     | 説明                        |
| --------------------------- | ------ | --------------------------- |
| `syokaiCnt`                 | number | 紹介件数                    |
| `syokaiTokutenCompleteCnt`  | number | 特典付与済み件数            |
| `syokaiTokutenWaitCnt`      | number | 適用待ち件数                |
| `syokaiTokutenExpiredCnt`   | number | 適用外件数                  |
| `syokaiUrl`                 | string | 紹介用URL                   |
| `syokaiAmbassadorRank`      | string | アンバサダーランクコード    |
| `syokaiAmbassadorRankName`  | string | アンバサダーランク名称      |
| `cntToNextRank`             | number | ランクアップに必要な紹介件数|

---

## API一覧サマリー

| # | API名 | エンドポイント | 種別 |
|---|-------|---------------|------|
| 3.1 | Get Telnum List | `/get_telnum_list` | 参照 |
| 3.2 | Get Line Name | `/get_line_name` | 参照 |
| 4.1 | Get Capacity | `/get_capacity` | 参照 |
| 4.2 | Get Capacity For Gift | `/get_capacity_for_gift` | 参照 |
| 4.3 | Change Gift | `/change_gift` | 更新 |
| 4.4 | Issue Gift | `/issue_gift` | 更新 |
| 4.5 | Get Packetcharge Info | `/get_packetcharge_info` | 参照 |
| 4.6 | Charge Packet | `/charge_packet` | 更新 |
| 4.7 | Get Packetshare Info | `/get_packetshare_info` | 参照 |
| 5.1 | Declare Devolve | `/declare_devolve` | 更新 |
| 5.2 | Get Devolve Declare Stat | `/get_devolve_declare_stat` | 参照 |
| 5.3 | Get Devolve Declare Hist Thismonth | `/get_devolve_declare_hist_thismonth` | 参照 |
| 6.1 | Get My Tank | `/get_my_tank` | 参照 |
| 6.2 | Get My Tank History | `/get_my_tank_history` | 参照 |
| 6.3 | My Tank In | `/my_tank_in` | 更新 |
| 6.4 | My Tank Out | `/my_tank_out` | 更新 |
| 6.5 | Get Pasket Auto Out | `/get_pasket_auto_out` | 参照 |
| 6.6 | Set Pasket Auto Out | `/set_pasket_auto_out` | 更新 |
| 7.1 | Change Speed | `/change_speed` | 更新 |
| 7.2 | Get Speed Info | `/get_speed_info` | 参照 |
| 7.3 | Get Traffic History | `/get_traffic_history` | 参照 |
| 7.4 | Login Stamp | `/login_stamp` | 更新 |
| 7.5 | Get Video Ad Info | `/get_video_ad_info` | 参照 |
| 7.6 | Get Syokai Info | `/get_syokai_info` | 参照 |
