# Power Apps 数式集 — 書籍在庫管理アプリ

全コントロールの配置と数式をコピペで使えるようにまとめたもの。
アプリ形式: **キャンバスアプリ（電話レイアウト）**

---

## 事前準備

### データソース接続

Power Apps エディタの左メニュー「データ」から以下を追加:

1. **SharePoint** → サイト選択 → リスト `InventoryMaster`
2. **SharePoint** → サイト選択 → リスト `TransactionHistory`
3. **SharePoint** → サイト選択 → リスト `Recipients`

### Power Automate 接続

左メニュー「Power Automate」から以下のフローを追加:

1. `FetchBookTitle`
2. `SendShipmentCSV`

> `UpdateInventory` は SharePoint トリガーなのでアプリとの接続不要。

### App.OnStart

```
App.OnStart:

Set(varCurrentISBN, "");
Set(varCurrentBookTitle, "");
Set(varTransactionType, "入庫");
Set(varEditMode, false);
Set(varSelectedHistory, Blank());
```

---

## Screen 1: MainScreen（メイン画面）

### レイアウト

```
┌──────────────────────────────┐
│  ヘッダー: 書籍在庫管理       │
├──────────────────────────────┤
│  [🔍 検索ボックス          ] │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │ ISBN: 978...           │  │
│  │ 書名: ○○○○            │  │
│  │ 在庫: 5冊              │  │
│  ├────────────────────────┤  │
│  │ ISBN: 978...           │  │
│  │ 書名: △△△△            │  │
│  │ 在庫: 2冊              │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│ [入庫] [出庫]    [出庫送信📧] │
└──────────────────────────────┘
```

### コントロールと数式

#### lblHeader（ラベル）
```
Text: "書籍在庫管理"
Size: 20
FontWeight: FontWeight.Bold
Fill: RGBA(0, 120, 212, 1)
Color: White
Height: 60
Width: Parent.Width
Align: Align.Center
```

#### txtSearch（テキスト入力）
```
HintText: "ISBN または書名で検索"
Width: Parent.Width - 20
X: 10
Y: lblHeader.Y + lblHeader.Height + 10
```

#### galInventory（ギャラリー — 垂直）
```
Items:
SortByColumns(
    Filter(
        InventoryMaster,
        txtSearch.Text = ""
        || StartsWith(Title, txtSearch.Text)
        || txtSearch.Text in BookTitle
    ),
    "LastUpdated",
    SortOrder.Descending
)

TemplateSize: 80
Width: Parent.Width - 20
X: 10
Y: txtSearch.Y + txtSearch.Height + 10
Height: Parent.Height - galInventory.Y - 70
```

**ギャラリー内コントロール:**

#### lblISBN（ギャラリー内ラベル）
```
Text: ThisItem.Title
Size: 12
Color: Gray
Y: 5
X: 10
```

#### lblBookTitle（ギャラリー内ラベル）
```
Text: ThisItem.BookTitle
Size: 16
FontWeight: FontWeight.Semibold
Y: lblISBN.Y + lblISBN.Height
X: 10
```

#### lblStock（ギャラリー内ラベル）
```
Text: ThisItem.CurrentStock & " 冊"
Size: 18
FontWeight: FontWeight.Bold
Align: Align.Right
X: Parent.TemplateWidth - 80
Y: 20
Color: If(ThisItem.CurrentStock <= 0, RGBA(220, 38, 38, 1), RGBA(0, 0, 0, 1))
```

#### galInventory.OnSelect
```
Navigate(HistoryScreen, ScreenTransition.None);
Set(varFilterISBN, ThisItem.Title)
```

#### btnReceive（入庫ボタン）
```
Text: "入庫"
OnSelect:
    Set(varTransactionType, "入庫");
    Set(varEditMode, false);
    Set(varCurrentISBN, "");
    Set(varCurrentBookTitle, "");
    Navigate(RegisterScreen, ScreenTransition.None)

Width: (Parent.Width - 30) / 3
X: 5
Y: Parent.Height - 55
Fill: RGBA(0, 120, 212, 1)
```

#### btnShip（出庫ボタン）
```
Text: "出庫"
OnSelect:
    Set(varTransactionType, "出庫");
    Set(varEditMode, false);
    Set(varCurrentISBN, "");
    Set(varCurrentBookTitle, "");
    Navigate(RegisterScreen, ScreenTransition.None)

Width: (Parent.Width - 30) / 3
X: btnReceive.X + btnReceive.Width + 5
Y: Parent.Height - 55
Fill: RGBA(0, 120, 212, 1)
```

#### btnSendCSV（出庫送信ボタン）
```
Text: "出庫送信 📧"
OnSelect:
    Set(varSending, true);
    Set(
        varSendResult,
        SendShipmentCSV.Run()
    );
    Set(varSending, false);
    Notify(
        "出庫データを送信しました（" & varSendResult.sentcount & " 件）",
        NotificationType.Success
    )

Width: (Parent.Width - 30) / 3
X: btnShip.X + btnShip.Width + 5
Y: Parent.Height - 55
Fill: RGBA(16, 124, 16, 1)
DisplayMode: If(varSending, DisplayMode.Disabled, DisplayMode.Edit)
```

---

## Screen 2: RegisterScreen（入出庫登録画面）

### レイアウト

```
┌──────────────────────────────┐
│  [← 戻る]  入庫登録          │
├──────────────────────────────┤
│                              │
│  ISBN                        │
│  [___________________________]│
│                              │
│  書名                        │
│  [自動取得された書名        ] │
│  （取得中...）                │
│                              │
│  冊数                        │
│  [___1___]                   │
│                              │
│          [  登録  ]          │
│                              │
└──────────────────────────────┘
```

### コントロールと数式

#### iconBack（左矢印アイコン）
```
Icon: Icon.BackArrow
OnSelect: Back()
X: 10
Y: 15
Width: 30
Height: 30
```

#### lblRegHeader（ラベル）
```
Text: If(varEditMode, "履歴修正", varTransactionType & "登録")
Size: 20
FontWeight: FontWeight.Bold
X: 50
Y: 10
```

#### lblISBNLabel（ラベル）
```
Text: "ISBN"
Y: 70
X: 10
```

#### txtISBN（テキスト入力）
```
Default: varCurrentISBN
HintText: "ISBNコードを入力（13桁）"
Format: TextFormat.Number
Width: Parent.Width - 20
X: 10
Y: lblISBNLabel.Y + lblISBNLabel.Height + 5
DisplayMode: If(varEditMode, DisplayMode.Disabled, DisplayMode.Edit)

OnChange:
    If(
        Len(Self.Text) = 13,
        // まず在庫マスタから検索
        Set(
            varExistingItem,
            LookUp(InventoryMaster, Title = Self.Text)
        );
        If(
            !IsBlank(varExistingItem),
            // マスタにある場合はマスタの書名を使用
            Set(varCurrentBookTitle, varExistingItem.BookTitle);
            Set(varBookFetched, true),
            // マスタにない場合はAPIで取得
            Set(varFetchingTitle, true);
            Set(
                varFetchResult,
                FetchBookTitle.Run(Self.Text)
            );
            Set(varFetchingTitle, false);
            If(
                !IsBlank(varFetchResult.booktitle),
                Set(varCurrentBookTitle, varFetchResult.booktitle);
                Set(varBookFetched, true),
                Set(varCurrentBookTitle, "");
                Set(varBookFetched, false)
            )
        )
    )
```

#### lblBookTitleLabel（ラベル）
```
Text: "書名"
Y: txtISBN.Y + txtISBN.Height + 15
X: 10
```

#### txtBookTitle（テキスト入力）
```
Default: varCurrentBookTitle
HintText: If(varFetchingTitle, "取得中...", "書名を入力")
Width: Parent.Width - 20
X: 10
Y: lblBookTitleLabel.Y + lblBookTitleLabel.Height + 5
DisplayMode:
    If(
        varEditMode, DisplayMode.Disabled,
        varBookFetched, DisplayMode.Disabled,
        DisplayMode.Edit
    )
```

#### lblFetchStatus（ラベル）
```
Text:
    If(
        varFetchingTitle, "📖 OpenBD から書名を取得中...",
        varBookFetched, "✅ 書名を自動取得しました",
        Len(txtISBN.Text) = 13 && IsBlank(varCurrentBookTitle),
            "⚠ 書名が見つかりません。手入力してください",
        ""
    )
Size: 11
Color: If(varFetchingTitle, Gray, varBookFetched, Green, RGBA(200, 100, 0, 1))
Y: txtBookTitle.Y + txtBookTitle.Height + 2
X: 10
```

#### lblQuantityLabel（ラベル）
```
Text: "冊数"
Y: lblFetchStatus.Y + lblFetchStatus.Height + 15
X: 10
```

#### txtQuantity（テキスト入力）
```
Default: If(varEditMode, Text(varSelectedHistory.Quantity), "1")
Format: TextFormat.Number
Width: 100
X: 10
Y: lblQuantityLabel.Y + lblQuantityLabel.Height + 5
```

#### lblStockInfo（ラベル — 出庫時の在庫表示）
```
Text:
    If(
        varTransactionType = "出庫" && !IsBlank(varExistingItem),
        "現在庫: " & varExistingItem.CurrentStock & " 冊",
        ""
    )
Size: 14
Color: RGBA(0, 120, 212, 1)
Y: txtQuantity.Y + txtQuantity.Height + 5
X: 10
Visible: varTransactionType = "出庫"
```

#### btnRegister（登録ボタン）
```
Text: If(varEditMode, "修正を保存", varTransactionType & "を登録")
Width: Parent.Width - 40
X: 20
Y: lblStockInfo.Y + lblStockInfo.Height + 30
Size: 16
Fill: If(varTransactionType = "入庫", RGBA(0, 120, 212, 1), RGBA(220, 38, 38, 1))

OnSelect:
    // バリデーション
    If(
        IsBlank(txtISBN.Text) || Len(txtISBN.Text) <> 13,
        Notify("ISBNは13桁で入力してください", NotificationType.Error);
        Return()
    );
    If(
        IsBlank(txtBookTitle.Text) && IsBlank(varCurrentBookTitle),
        Notify("書名を入力してください", NotificationType.Error);
        Return()
    );
    If(
        Value(txtQuantity.Text) < 1,
        Notify("冊数は1以上を入力してください", NotificationType.Error);
        Return()
    );
    // 出庫時の在庫チェック
    If(
        varTransactionType = "出庫"
        && !IsBlank(varExistingItem)
        && varExistingItem.CurrentStock < Value(txtQuantity.Text),
        Notify(
            "在庫が不足しています（現在庫: " & varExistingItem.CurrentStock & " 冊）",
            NotificationType.Error
        );
        Return()
    );

    If(
        varEditMode,
        // --- 修正モード ---
        Patch(
            TransactionHistory,
            varSelectedHistory,
            {
                Quantity: Value(txtQuantity.Text)
            }
        );
        Notify("履歴を修正しました", NotificationType.Success),
        // --- 新規登録モード ---
        Patch(
            TransactionHistory,
            Defaults(TransactionHistory),
            {
                Title: txtISBN.Text,
                BookTitle: If(
                    !IsBlank(varCurrentBookTitle),
                    varCurrentBookTitle,
                    txtBookTitle.Text
                ),
                TransactionType: {Value: varTransactionType},
                Quantity: Value(txtQuantity.Text),
                TransactionDate: Now(),
                IsSent: false
            }
        );
        Notify(varTransactionType & "を登録しました", NotificationType.Success)
    );
    Back()
```

> **注意**: 在庫マスタの更新は Power Automate (`UpdateInventory`) が自動で行うため、
> アプリ側では TransactionHistory への登録のみ行う。

---

## Screen 3: HistoryScreen（履歴一覧・修正画面）

### レイアウト

```
┌──────────────────────────────┐
│  [← 戻る]  入出庫履歴        │
├──────────────────────────────┤
│  [すべて ▼] [ISBN検索      ] │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │ 入庫 978... ○○○  3冊  │  │
│  │ 2024/01/15 14:30       │  │
│  ├────────────────────────┤  │
│  │ 出庫 978... △△△  1冊  │  │
│  │ 2024/01/16 09:00  ✉済  │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### コントロールと数式

#### iconBackHist（左矢印アイコン）
```
Icon: Icon.BackArrow
OnSelect: Back()
X: 10
Y: 15
```

#### lblHistHeader（ラベル）
```
Text: "入出庫履歴"
Size: 20
FontWeight: FontWeight.Bold
X: 50
Y: 10
```

#### ddFilter（ドロップダウン）
```
Items: ["すべて", "入庫のみ", "出庫のみ", "未送信出庫"]
Default: "すべて"
Width: 130
X: 10
Y: 60
```

#### txtHistSearch（テキスト入力）
```
HintText: "ISBN検索"
Width: Parent.Width - ddFilter.Width - 30
X: ddFilter.X + ddFilter.Width + 10
Y: 60
Default: If(!IsBlank(varFilterISBN), varFilterISBN, "")
```

#### galHistory（ギャラリー — 垂直）
```
Items:
SortByColumns(
    Filter(
        TransactionHistory,
        // ドロップダウンフィルタ
        (ddFilter.Selected.Value = "すべて"
            || (ddFilter.Selected.Value = "入庫のみ" && TransactionType.Value = "入庫")
            || (ddFilter.Selected.Value = "出庫のみ" && TransactionType.Value = "出庫")
            || (ddFilter.Selected.Value = "未送信出庫"
                && TransactionType.Value = "出庫" && IsSent = false)
        )
        &&
        // テキスト検索
        (txtHistSearch.Text = "" || StartsWith(Title, txtHistSearch.Text))
    ),
    "TransactionDate",
    SortOrder.Descending
)

TemplateSize: 65
Width: Parent.Width - 20
X: 10
Y: ddFilter.Y + ddFilter.Height + 10
Height: Parent.Height - galHistory.Y - 10
```

**ギャラリー内コントロール:**

#### lblHistType（ギャラリー内ラベル）
```
Text: ThisItem.TransactionType.Value
Size: 12
FontWeight: FontWeight.Bold
Color:
    If(
        ThisItem.TransactionType.Value = "入庫",
        RGBA(0, 120, 212, 1),
        RGBA(220, 38, 38, 1)
    )
X: 5
Y: 5
Width: 40
```

#### lblHistISBN（ギャラリー内ラベル）
```
Text: ThisItem.Title
Size: 11
Color: Gray
X: 50
Y: 5
```

#### lblHistBookTitle（ギャラリー内ラベル）
```
Text: ThisItem.BookTitle
Size: 13
X: 50
Y: 22
Width: Parent.TemplateWidth - 120
```

#### lblHistQty（ギャラリー内ラベル）
```
Text: ThisItem.Quantity & " 冊"
Size: 16
FontWeight: FontWeight.Bold
Align: Align.Right
X: Parent.TemplateWidth - 70
Y: 5
```

#### lblHistDate（ギャラリー内ラベル）
```
Text: Text(ThisItem.TransactionDate, "yyyy/mm/dd hh:mm")
Size: 10
Color: Gray
X: 50
Y: 40
```

#### lblHistSent（ギャラリー内ラベル）
```
Text: If(ThisItem.IsSent, "✉済", "")
Size: 10
Color: RGBA(16, 124, 16, 1)
X: Parent.TemplateWidth - 40
Y: 40
Visible: ThisItem.TransactionType.Value = "出庫"
```

#### galHistory.OnSelect
```
Set(varEditMode, true);
Set(varSelectedHistory, ThisItem);
Set(varCurrentISBN, ThisItem.Title);
Set(varCurrentBookTitle, ThisItem.BookTitle);
Set(varTransactionType, ThisItem.TransactionType.Value);
Set(varBookFetched, true);
Navigate(RegisterScreen, ScreenTransition.None)
```

---

## 変数一覧

| 変数名 | 型 | 用途 |
|--------|------|------|
| `varCurrentISBN` | Text | 登録画面のISBN |
| `varCurrentBookTitle` | Text | 登録画面の書名 |
| `varTransactionType` | Text | "入庫" or "出庫" |
| `varEditMode` | Boolean | 修正モードフラグ |
| `varSelectedHistory` | Record | 修正対象の履歴レコード |
| `varExistingItem` | Record | 在庫マスタの既存レコード |
| `varBookFetched` | Boolean | 書名取得済みフラグ |
| `varFetchingTitle` | Boolean | 書名取得中フラグ |
| `varFetchResult` | Record | FetchBookTitle の戻り値 |
| `varSending` | Boolean | CSV送信中フラグ |
| `varSendResult` | Record | SendShipmentCSV の戻り値 |
| `varFilterISBN` | Text | 履歴画面のISBNフィルタ |
