# 書籍在庫管理アプリ — Power Platform 構築ガイド

ISBN コードと冊数で入出庫を管理し、出庫データを CSV メールで送信する簡素なアプリ。
Microsoft Power Apps / Power Automate / Lists のみで構成する。

---

## 全体構成図

```
┌─────────────────────────────────────────────────────┐
│  Power Apps（キャンバスアプリ）                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │メイン画面 │ │入出庫登録│ │ 履歴一覧・修正       │  │
│  └──────────┘ └──────────┘ └──────────────────────┘  │
│       │              │                │               │
│       │         ┌────▼────┐           │               │
│       │         │登録ボタン│           │               │
│       │         └────┬────┘           │               │
└───────┼──────────────┼────────────────┼───────────────┘
        │              │                │
   ┌────▼────┐   ┌─────▼──────┐  ┌─────▼──────┐
   │出庫送信 │   │在庫自動更新│  │ 書名自動   │
   │CSVフロー│   │  フロー    │  │ 取得フロー │
   │(PA Flow)│   │ (PA Flow)  │  │ (PA Flow)  │
   └────┬────┘   └─────┬──────┘  └─────┬──────┘
        │              │               │
   ┌────▼────┐   ┌─────▼──────┐  OpenBD API
   │Outlook  │   │            │  (外部)
   │メール   │   │            │
   └─────────┘   │            │
                 │ Microsoft  │
   ┌─────────┐   │   Lists    │
   │配信先   │◄──┤            │
   │リスト   │   │ ┌────────┐ │
   └─────────┘   │ │在庫    │ │
                 │ │マスタ  │ │
                 │ ├────────┤ │
                 │ │入出庫  │ │
                 │ │履歴    │ │
                 │ └────────┘ │
                 └────────────┘
```

---

## セットアップ手順

### Step 1: Microsoft Lists を作成（3つ）

SharePoint サイトまたは Microsoft Lists アプリで以下 3 つのリストを作成する。
列定義の詳細は [`lists-schema.json`](./lists-schema.json) を参照。

#### 1-1. 在庫マスタ (`InventoryMaster`)

| 列名 | 型 | 必須 | 備考 |
|------|------|------|------|
| Title | 1行テキスト | ○ | ISBN コード（既定の Title 列を流用） |
| BookTitle | 1行テキスト | ○ | 書名 |
| CurrentStock | 数値 | ○ | 現在庫数（既定値 0） |
| LastUpdated | 日付と時刻 | | 最終更新日時 |

> Title 列を「ISBN」に表示名変更して使う。

#### 1-2. 入出庫履歴 (`TransactionHistory`)

| 列名 | 型 | 必須 | 備考 |
|------|------|------|------|
| Title | 1行テキスト | ○ | ISBN コード |
| BookTitle | 1行テキスト | ○ | 書名 |
| TransactionType | 選択肢 | ○ | 選択肢: `入庫`, `出庫` |
| Quantity | 数値 | ○ | 冊数 |
| TransactionDate | 日付と時刻 | ○ | 登録日時 |
| IsSent | はい/いいえ | | 出庫メール送信済み（既定値: いいえ） |

#### 1-3. 配信先 (`Recipients`)

| 列名 | 型 | 必須 | 備考 |
|------|------|------|------|
| Title | 1行テキスト | ○ | 氏名 |
| Email | 1行テキスト | ○ | メールアドレス |

> 送信先を 1 件以上登録しておくこと。

---

### Step 2: Power Automate フローを作成（3つ）

フロー定義の詳細は各 JSON ファイルを参照。
Power Automate の「マイフロー」→「インポート」でも利用できるが、
手動作成のほうが確実。以下の順で作成する。

#### 2-1. 書名自動取得フロー (`FetchBookTitle`)

→ 詳細: [`flow-fetch-book-title.json`](./flow-fetch-book-title.json)

- **トリガー**: Power Apps (V2)
- **入力**: ISBN（テキスト）
- **処理**: OpenBD API (`https://api.openbd.jp/v1/get?isbn=<ISBN>`) を HTTP コネクタで呼び出し
- **出力**: 書名をPower Appsに返す（取得できない場合は空文字）

#### 2-2. 在庫自動更新フロー (`UpdateInventory`)

→ 詳細: [`flow-update-inventory.json`](./flow-update-inventory.json)

- **トリガー**: SharePoint「項目が作成されたとき」（TransactionHistory リスト）
- **処理**:
  1. ISBN で在庫マスタを検索
  2. 見つかった → 入庫なら加算、出庫なら減算して更新
  3. 見つからない → 新規行を作成（入庫時のみ）

#### 2-3. 出庫CSV送信フロー (`SendShipmentCSV`)

→ 詳細: [`flow-send-shipment-csv.json`](./flow-send-shipment-csv.json)

- **トリガー**: Power Apps (V2)
- **処理**:
  1. TransactionHistory から `TransactionType=出庫 AND IsSent=false` を取得
  2. CSV テキスト生成
  3. Recipients リストからメールアドレスを取得
  4. Outlook でCSV添付メール送信
  5. 送信した履歴の IsSent を `true` に更新
- **出力**: 送信件数をPower Appsに返す

---

### Step 3: Power Apps キャンバスアプリを作成

→ 数式の全文: [`power-apps-formulas.md`](./power-apps-formulas.md)

#### アプリ作成手順

1. Power Apps (https://make.powerapps.com) → 「+ 作成」→「空のキャンバスアプリ」
2. 名前: `書籍在庫管理` / 形式: **電話**
3. データソース追加:
   - SharePoint → サイト選択 → `InventoryMaster`, `TransactionHistory`, `Recipients` の 3 リスト
4. Power Automate 接続:
   - 「アクション」→「Power Automate」→ 作成済みの 3 フローを追加

#### 画面構成

| 画面 | 役割 |
|------|------|
| **MainScreen** | 在庫一覧表示、検索、入庫/出庫/出庫送信ボタン |
| **RegisterScreen** | ISBN・冊数入力、入庫 or 出庫登録 |
| **HistoryScreen** | 入出庫履歴一覧、修正・削除 |

各画面のコントロール配置と数式は `power-apps-formulas.md` に記載。

---

### Step 4: テスト

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1 | ISBN `9784062938426` で入庫 3 冊 | 在庫マスタに新規行、現在庫数 = 3、書名が自動取得される |
| 2 | 同 ISBN で出庫 1 冊 | 現在庫数 = 2 |
| 3 | 出庫送信ボタン押下 | 配信先に CSV メールが届く、履歴の送信済み = はい |
| 4 | 履歴を修正（冊数変更） | 在庫マスタが再計算される |
| 5 | 在庫 0 の ISBN で出庫 | エラーメッセージ表示（マイナス在庫防止） |

---

## ファイル一覧

| ファイル | 内容 |
|---------|------|
| `README.md` | 本ファイル（全体ガイド） |
| `lists-schema.json` | Microsoft Lists 列定義 |
| `power-apps-formulas.md` | Power Apps 全数式（コピペ用） |
| `flow-fetch-book-title.json` | 書名取得フロー定義 |
| `flow-update-inventory.json` | 在庫自動更新フロー定義 |
| `flow-send-shipment-csv.json` | 出庫CSV送信フロー定義 |
