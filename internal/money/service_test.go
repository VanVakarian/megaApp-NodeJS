package money

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"testing"

	"megaapp-back/internal/httpx/legacy"

	_ "modernc.org/sqlite"
)

func TestServiceSnapshotIncludesNormalizedAssets(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyReadFixtures(t, db, 1)

	service := NewService(NewRepository(db))
	snapshot, err := service.GetSnapshot(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetSnapshot() error = %v", err)
	}

	if len(snapshot.Currencies) != 1 || len(snapshot.Categories) != 2 || len(snapshot.Organizations) != 1 || len(snapshot.Accounts) != 1 {
		t.Fatalf("unexpected snapshot reference sizes = %+v", snapshot)
	}
	if len(snapshot.Assets) != 1 {
		t.Fatalf("Assets len = %d, want 1", len(snapshot.Assets))
	}
	if got := snapshot.Assets[0].AccountIDs; len(got) != 1 || got[0] != 1 {
		t.Fatalf("Asset AccountIDs = %v, want [1]", got)
	}
	if len(snapshot.Transactions) != 2 {
		t.Fatalf("Transactions len = %d, want 2", len(snapshot.Transactions))
	}
	if len(snapshot.InvestAssetTrades) != 1 {
		t.Fatalf("InvestAssetTrades len = %d, want 1", len(snapshot.InvestAssetTrades))
	}
	if len(snapshot.RateHistory) != 1 {
		t.Fatalf("RateHistory len = %d, want 1", len(snapshot.RateHistory))
	}
}

func TestServiceCreateOrganizationResizesLogo(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	service := NewService(NewRepository(db))

	logo := makeBase64PNG(t, 64, 48)
	organizationID, err := service.CreateOrganization(context.Background(), 1, OrganizationInput{Title: "Broker", LogoBase64: &logo})
	if err != nil {
		t.Fatalf("CreateOrganization() error = %v", err)
	}
	if organizationID <= 0 {
		t.Fatalf("CreateOrganization() id = %d, want > 0", organizationID)
	}

	organization, err := service.repo.GetOrganizationByID(context.Background(), 1, organizationID)
	if err != nil {
		t.Fatalf("GetOrganizationByID() error = %v", err)
	}
	if organization == nil || organization.LogoBase64 == nil {
		t.Fatal("stored organization logo is nil")
	}
	if *organization.LogoBase64 == logo {
		t.Fatal("logo was not resized")
	}
}

func TestServiceCategoryValidationAndDeleteGuards(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	service := NewService(NewRepository(db))

	_, err := service.CreateCategory(context.Background(), 1, CategoryInput{Name: "Bonus", CategoryType: CategoryTypeIncome, ParentID: int64Ptr(2)})
	assertMoneyValidationError(t, err, "Parent category type must match categoryType")

	err = service.DeleteCategory(context.Background(), 1, 1)
	assertMoneyConflictError(t, err, "Category has child categories")

	if _, err := db.Exec(`INSERT INTO moneyTransaction (userId, dateISO, accountId, amount, categoryId, kind, isGift) VALUES (1, '2026-06-18', 1, 100, 2, 'expense', 0)`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	err = service.DeleteCategory(context.Background(), 1, 2)
	assertMoneyConflictError(t, err, "Category is linked to existing transactions")
}

func TestServiceAccountValidationAndDeleteGuards(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	service := NewService(NewRepository(db))

	_, err := service.CreateAccount(context.Background(), 1, AccountInput{Title: "Wallet", CurrencyID: 999, Kind: AccountKindCash})
	assertMoneyValidationError(t, err, "Currency not found")

	if _, err := db.Exec(`INSERT INTO moneyTransaction (userId, dateISO, accountId, amount, categoryId, kind, isGift) VALUES (1, '2026-06-18', 1, 100, 2, 'expense', 0)`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	err = service.DeleteAccount(context.Background(), 1, 1)
	assertMoneyConflictError(t, err, "Account is linked to existing transactions")

	if _, err := db.Exec(`DELETE FROM moneyTransaction WHERE accountId = 1`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyAsset (userId, accountIdsJSON, ticker, title, type) VALUES (1, '[1]', 'AAPL', 'Apple', 'stock')`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	err = service.DeleteAccount(context.Background(), 1, 1)
	assertMoneyConflictError(t, err, "Account is linked to existing assets")
}

func TestServiceCreateAssetNormalizesAccountsAndSuspension(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyBrokerageAccount(t, db, 1, 2, "Brokerage", AccountKindBrokerage)
	service := NewService(NewRepository(db))

	assetID, err := service.CreateAsset(context.Background(), 1, AssetInput{
		Title:          " Apple ",
		Ticker:         " AAPL ",
		Type:           AssetTypeStock,
		AccountIDs:     []int64{2, 2},
		SuspendedSince: stringPtr("2026-06-01"),
		SuspendedUntil: stringPtr("2026-06-30"),
	})
	if err != nil {
		t.Fatalf("CreateAsset() error = %v", err)
	}
	if assetID <= 0 {
		t.Fatalf("CreateAsset() id = %d, want > 0", assetID)
	}

	asset, err := service.repo.GetAssetByID(context.Background(), 1, assetID)
	if err != nil {
		t.Fatalf("GetAssetByID() error = %v", err)
	}
	if asset == nil {
		t.Fatal("asset = nil")
	}
	if asset.Title != "Apple" || asset.Ticker != "AAPL" {
		t.Fatalf("asset = %+v, want trimmed title/ticker", asset)
	}
	if len(asset.AccountIDs) != 1 || asset.AccountIDs[0] != 2 {
		t.Fatalf("AccountIDs = %v, want [2]", asset.AccountIDs)
	}
}

func TestServiceAssetValidationAndGuards(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyBrokerageAccount(t, db, 1, 2, "Brokerage", AccountKindBrokerage)
	insertMoneyBrokerageAccount(t, db, 1, 3, "Crypto", AccountKindCrypto)
	service := NewService(NewRepository(db))

	_, err := service.CreateAsset(context.Background(), 1, AssetInput{Title: "Asset", Ticker: "AAA", Type: AssetTypeStock, AccountIDs: []int64{1}})
	assertMoneyValidationError(t, err, "Asset account must be brokerage or crypto: 1")

	_, err = service.CreateAsset(context.Background(), 1, AssetInput{Title: "Asset", Ticker: "AAA", Type: AssetTypeStock, AccountIDs: []int64{2}, SuspendedUntil: stringPtr("2026-06-30")})
	assertMoneyValidationError(t, err, "suspendedUntil requires suspendedSince to be set")

	assetID, err := service.CreateAsset(context.Background(), 1, AssetInput{Title: "Asset", Ticker: "AAA", Type: AssetTypeStock, AccountIDs: []int64{2, 3}})
	if err != nil {
		t.Fatalf("CreateAsset() error = %v", err)
	}

	if _, err := db.Exec(`INSERT INTO moneyTransaction (userId, dateISO, accountId, amount, kind, isGift, detailsJSON) VALUES (1, '2026-06-18', 2, 1000, 'invest_buy', 0, '{"assetId":` + fmt.Sprint(assetID) + `,"quantity":2}')`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	err = service.UpdateAsset(context.Background(), 1, assetID, AssetInput{Title: "Asset", Ticker: "AAA", Type: AssetTypeStock, AccountIDs: []int64{3}})
	assertMoneyConflictError(t, err, "Asset accounts linked to existing transactions cannot be removed")

	err = service.DeleteAsset(context.Background(), 1, assetID)
	assertMoneyConflictError(t, err, "Asset is linked to existing transactions")
}

func TestServiceTransactionLifecycleAndValidation(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyAccount(t, db, 1, 2, "Card", AccountKindCard)
	insertMoneyCategory(t, db, 1, 3, "Salary", nil, CategoryTypeIncome)
	service := NewService(NewRepository(db))

	created, err := service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:    "2026-06-18",
		AccountID:  1,
		Amount:     1500,
		CategoryID: int64Ptr(3),
		Kind:       TransactionKindIncome,
		IsGift:     true,
		Notes:      stringPtr("Salary"),
	})
	if err != nil {
		t.Fatalf("CreateTransaction() error = %v", err)
	}
	if created.ID <= 0 || created.TwinID != nil {
		t.Fatalf("CreateTransaction() result = %+v, want single transaction id", created)
	}

	stored, err := service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if stored == nil || stored.Kind != TransactionKindIncome || stored.CategoryID == nil || *stored.CategoryID != 3 {
		t.Fatalf("stored transaction = %+v", stored)
	}

	err = service.UpdateTransaction(context.Background(), 1, created.ID, TransactionInput{
		DateISO:   "2026-06-19",
		AccountID: 1,
		Amount:    1700,
		Kind:      TransactionKindIncome,
		IsGift:    false,
		Notes:     stringPtr("Salary updated"),
	})
	if err != nil {
		t.Fatalf("UpdateTransaction() error = %v", err)
	}

	stored, err = service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if stored == nil || stored.Amount != 1700 || stored.CategoryID != nil || stored.IsGift {
		t.Fatalf("updated transaction = %+v", stored)
	}

	err = service.UpdateTransaction(context.Background(), 1, created.ID, TransactionInput{
		DateISO:   "2026-06-19",
		AccountID: 2,
		Amount:    1700,
		Kind:      TransactionKindIncome,
	})
	assertMoneyValidationError(t, err, "Account cannot be changed")

	err = service.UpdateTransaction(context.Background(), 1, created.ID, TransactionInput{
		DateISO:   "2026-06-19",
		AccountID: 1,
		Amount:    1700,
		Kind:      TransactionKindExpense,
	})
	assertMoneyValidationError(t, err, "Transaction kind cannot be changed")

	err = service.DeleteTransaction(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("DeleteTransaction() error = %v", err)
	}
	stored, err = service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if stored != nil {
		t.Fatalf("stored transaction after delete = %+v, want nil", stored)
	}
}

func TestServiceTransferLifecycleAndRollback(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyAccount(t, db, 1, 2, "Card", AccountKindCard)
	insertMoneyAccount(t, db, 1, 3, "Savings", AccountKindChecking)
	service := NewService(NewRepository(db))

	created, err := service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:       "2026-06-18",
		AccountID:     1,
		Amount:        100,
		TwinAccountID: int64Ptr(2),
		TwinAmount:    float64Ptr(95),
		Kind:          TransactionKindTransfer,
		Notes:         stringPtr("Move"),
	})
	if err != nil {
		t.Fatalf("CreateTransaction() error = %v", err)
	}
	if created.ID <= 0 || created.TwinID == nil || *created.TwinID <= 0 {
		t.Fatalf("CreateTransaction() result = %+v, want pair ids", created)
	}

	fromTransaction, err := service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	toTransaction, err := service.repo.GetTransactionByID(context.Background(), 1, *created.TwinID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if fromTransaction == nil || toTransaction == nil || fromTransaction.TwinID == nil || toTransaction.TwinID == nil {
		t.Fatalf("transfer pair = %+v %+v", fromTransaction, toTransaction)
	}
	if *fromTransaction.TwinID != toTransaction.ID || *toTransaction.TwinID != fromTransaction.ID {
		t.Fatalf("transfer pair twin ids = %+v %+v", fromTransaction, toTransaction)
	}

	err = service.UpdateTransaction(context.Background(), 1, created.ID, TransactionInput{
		DateISO:       "2026-06-19",
		AccountID:     1,
		Amount:        110,
		TwinAccountID: int64Ptr(2),
		TwinAmount:    float64Ptr(108),
		Kind:          TransactionKindTransfer,
		Notes:         stringPtr("Move updated"),
	})
	if err != nil {
		t.Fatalf("UpdateTransaction() error = %v", err)
	}

	fromTransaction, err = service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	toTransaction, err = service.repo.GetTransactionByID(context.Background(), 1, *created.TwinID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if fromTransaction == nil || toTransaction == nil || fromTransaction.Amount != 110 || toTransaction.Amount != 108 || fromTransaction.DateISO != "2026-06-19" || toTransaction.DateISO != "2026-06-19" {
		t.Fatalf("updated transfer pair = %+v %+v", fromTransaction, toTransaction)
	}

	err = service.UpdateTransaction(context.Background(), 1, created.ID, TransactionInput{
		DateISO:       "2026-06-19",
		AccountID:     1,
		Amount:        110,
		TwinAccountID: int64Ptr(3),
		TwinAmount:    float64Ptr(108),
		Kind:          TransactionKindTransfer,
	})
	assertMoneyValidationError(t, err, "Account cannot be changed")

	err = service.DeleteTransaction(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("DeleteTransaction() error = %v", err)
	}
	fromTransaction, err = service.repo.GetTransactionByID(context.Background(), 1, created.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	toTransaction, err = service.repo.GetTransactionByID(context.Background(), 1, *created.TwinID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if fromTransaction != nil || toTransaction != nil {
		t.Fatalf("deleted transfer pair = %+v %+v, want nil nil", fromTransaction, toTransaction)
	}

	_, err = service.repo.CreateTransferPair(context.Background(), 1, TransactionInput{
		DateISO:       "2026-06-20",
		AccountID:     1,
		Amount:        50,
		TwinAccountID: int64Ptr(999),
		TwinAmount:    float64Ptr(49),
		Kind:          TransactionKindTransfer,
	})
	if err == nil {
		t.Fatal("CreateTransferPair() error = nil, want rollback error")
	}
	assertMoneyTransactionCount(t, db, 0, `SELECT COUNT(*) FROM moneyTransaction WHERE userId = 1 AND kind = 'transfer'`)
}

func TestServiceInvestTransactionLifecycleAndValidation(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyBrokerageAccount(t, db, 1, 2, "Brokerage", AccountKindBrokerage)
	insertMoneyBrokerageAccount(t, db, 1, 3, "Crypto", AccountKindCrypto)
	insertMoneyAsset(t, db, 1, 1, "Apple", "AAPL", AssetTypeStock, []int64{2})
	insertMoneyAsset(t, db, 1, 2, "Bond", "OFZ", AssetTypeBond, []int64{2})
	service := NewService(NewRepository(db))

	buyResult, err := service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-18",
		AccountID: 2,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         2,
			"price":            100,
			"commissionAmount": 5,
		},
	})
	if err != nil {
		t.Fatalf("CreateTransaction() error = %v", err)
	}
	buyTransaction, err := service.repo.GetTransactionByID(context.Background(), 1, buyResult.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if buyTransaction == nil || buyTransaction.Kind != TransactionKindInvestBuy || buyTransaction.Amount != 205 || buyTransaction.CategoryID != nil || buyTransaction.IsGift {
		t.Fatalf("buy transaction = %+v", buyTransaction)
	}
	buyDetails := mustMoneyJSONMap(t, buyTransaction.DetailsJSON)
	if got := buyDetails["assetId"]; got != float64(1) {
		t.Fatalf("buy assetId = %v, want 1", got)
	}

	err = service.UpdateTransaction(context.Background(), 1, buyResult.ID, TransactionInput{
		DateISO:   "2026-06-19",
		AccountID: 2,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         3,
			"price":            90,
			"commissionAmount": 1,
		},
	})
	if err != nil {
		t.Fatalf("UpdateTransaction() error = %v", err)
	}
	buyTransaction, err = service.repo.GetTransactionByID(context.Background(), 1, buyResult.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if buyTransaction == nil || buyTransaction.Amount != 271 {
		t.Fatalf("updated buy transaction = %+v", buyTransaction)
	}

	sellResult, err := service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-20",
		AccountID: 2,
		Kind:      TransactionKindInvestSell,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         1,
			"price":            120,
			"commissionAmount": 2,
		},
	})
	if err != nil {
		t.Fatalf("CreateTransaction() error = %v", err)
	}
	if sellResult.ID <= 0 {
		t.Fatalf("CreateTransaction() sell id = %d, want > 0", sellResult.ID)
	}

	dividendResult, err := service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-21",
		AccountID: 2,
		Amount:    15,
		Kind:      TransactionKindInvestDividend,
		DetailsJSON: map[string]any{
			"assetId": 2,
		},
	})
	if err != nil {
		t.Fatalf("CreateTransaction() error = %v", err)
	}
	dividendTransaction, err := service.repo.GetTransactionByID(context.Background(), 1, dividendResult.ID)
	if err != nil {
		t.Fatalf("GetTransactionByID() error = %v", err)
	}
	if dividendTransaction == nil || dividendTransaction.Kind != TransactionKindInvestDividend || dividendTransaction.Amount != 15 {
		t.Fatalf("dividend transaction = %+v", dividendTransaction)
	}

	snapshot, err := service.GetSnapshot(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetSnapshot() error = %v", err)
	}
	if len(snapshot.InvestAssetTrades) != 2 {
		t.Fatalf("InvestAssetTrades len = %d, want 2", len(snapshot.InvestAssetTrades))
	}

	_, err = service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-22",
		AccountID: 1,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         1,
			"price":            100,
			"commissionAmount": 1,
		},
	})
	assertMoneyValidationError(t, err, "Invest transaction requires brokerage or crypto account")

	_, err = service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:    "2026-06-22",
		AccountID:  2,
		CategoryID: int64Ptr(1),
		Kind:       TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         1,
			"price":            100,
			"commissionAmount": 1,
		},
	})
	assertMoneyValidationError(t, err, "Category is not allowed for invest transactions")

	_, err = service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-22",
		AccountID: 3,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          1,
			"quantity":         1,
			"price":            100,
			"commissionAmount": 1,
		},
	})
	assertMoneyValidationError(t, err, "Asset does not belong to selected account")

	_, err = service.CreateTransaction(context.Background(), 1, TransactionInput{
		DateISO:   "2026-06-22",
		AccountID: 2,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":               1,
			"quantity":              1,
			"price":                 100,
			"commissionAmount":      1,
			"accruedInterestAmount": 1,
		},
	})
	assertMoneyValidationError(t, err, "detailsJSON.accruedInterestAmount is allowed only for bond assets")

	err = service.UpdateTransaction(context.Background(), 1, buyResult.ID, TransactionInput{
		DateISO:   "2026-06-19",
		AccountID: 2,
		Kind:      TransactionKindInvestBuy,
		DetailsJSON: map[string]any{
			"assetId":          2,
			"quantity":         3,
			"price":            90,
			"commissionAmount": 1,
		},
	})
	assertMoneyValidationError(t, err, "Asset cannot be changed")
}

func openMoneyTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}

	schema := `
		PRAGMA foreign_keys = ON;

		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT,
			hashedPassword TEXT,
			isAdmin BOOLEAN
		);

		CREATE TABLE moneyCurrency (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			title TEXT NOT NULL,
			ticker TEXT NOT NULL,
			symbol TEXT NOT NULL,
			symbolPosEnum TEXT NOT NULL,
			whitespace BOOLEAN NOT NULL DEFAULT 0,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE moneyCategories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			name TEXT NOT NULL,
			parentId INTEGER,
			categoryType TEXT NOT NULL,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (parentId) REFERENCES moneyCategories(id) ON DELETE RESTRICT
		);

		CREATE TABLE moneyOrganization (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			title TEXT NOT NULL,
			logoBase64 TEXT,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE moneyAccount (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			title TEXT NOT NULL,
			currencyId INTEGER NOT NULL,
			isInvest BOOLEAN NOT NULL DEFAULT 0,
			isArchived BOOLEAN NOT NULL DEFAULT 0,
			kind TEXT NOT NULL,
			organizationId INTEGER,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (currencyId) REFERENCES moneyCurrency(id) ON DELETE RESTRICT,
			FOREIGN KEY (organizationId) REFERENCES moneyOrganization(id) ON DELETE SET NULL
		);

		CREATE TABLE moneyAsset (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			accountIdsJSON TEXT NOT NULL,
			ticker TEXT NOT NULL,
			title TEXT NOT NULL,
			type TEXT NOT NULL,
			suspendedSince TEXT,
			suspendedUntil TEXT,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE moneyTransaction (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userId INTEGER NOT NULL,
			dateISO TEXT NOT NULL,
			accountId INTEGER NOT NULL,
			amount REAL NOT NULL,
			categoryId INTEGER,
			kind TEXT NOT NULL,
			isGift BOOLEAN NOT NULL DEFAULT 0,
			notes TEXT,
			detailsJSON TEXT,
			twinId INTEGER,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (accountId) REFERENCES moneyAccount(id) ON DELETE RESTRICT,
			FOREIGN KEY (categoryId) REFERENCES moneyCategories(id) ON DELETE RESTRICT,
			FOREIGN KEY (twinId) REFERENCES moneyTransaction(id) ON DELETE CASCADE
		);

		CREATE TABLE moneyRateHistory (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			dateISO TEXT NOT NULL,
			ratesJson TEXT NOT NULL
		);
	`

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		t.Fatalf("Exec() error = %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

func insertMoneyTestUser(t *testing.T, db *sql.DB, userID int64, username string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO users (id, username, hashedPassword, isAdmin) VALUES (?, ?, 'hash', 0)`, userID, username); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyReferenceFixtures(t *testing.T, db *sql.DB, userID int64) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyCurrency (id, userId, title, ticker, symbol, symbolPosEnum, whitespace) VALUES (1, ?, 'Ruble', 'RUB', '₽', 'before', 0)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyOrganization (id, userId, title, logoBase64) VALUES (1, ?, 'Bank', NULL)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyCategories (id, userId, name, parentId, categoryType) VALUES (1, ?, 'Food', NULL, 'expense')`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyCategories (id, userId, name, parentId, categoryType) VALUES (2, ?, 'Groceries', 1, 'expense')`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyAccount (id, userId, title, currencyId, isInvest, isArchived, kind, organizationId) VALUES (1, ?, 'Cash Wallet', 1, 0, 0, 'cash', 1)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyBrokerageAccount(t *testing.T, db *sql.DB, userID int64, accountID int64, title string, kind AccountKind) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyAccount (id, userId, title, currencyId, isInvest, isArchived, kind, organizationId) VALUES (?, ?, ?, 1, 1, 0, ?, 1)`, accountID, userID, title, kind); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyAccount(t *testing.T, db *sql.DB, userID int64, accountID int64, title string, kind AccountKind) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyAccount (id, userId, title, currencyId, isInvest, isArchived, kind, organizationId) VALUES (?, ?, ?, 1, 0, 0, ?, 1)`, accountID, userID, title, kind); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyAsset(t *testing.T, db *sql.DB, userID int64, assetID int64, title string, ticker string, assetType AssetType, accountIDs []int64) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyAsset (id, userId, accountIdsJSON, ticker, title, type) VALUES (?, ?, ?, ?, ?, ?)`, assetID, userID, marshalAccountIDs(accountIDs), ticker, title, assetType); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyCategory(t *testing.T, db *sql.DB, userID int64, categoryID int64, name string, parentID *int64, categoryType CategoryType) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyCategories (id, userId, name, parentId, categoryType) VALUES (?, ?, ?, ?, ?)`, categoryID, userID, name, nullableValue(parentID), categoryType); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func insertMoneyReadFixtures(t *testing.T, db *sql.DB, userID int64) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO moneyAsset (id, userId, accountIdsJSON, ticker, title, type, suspendedSince, suspendedUntil) VALUES (1, ?, '[1,1]', 'AAPL', 'Apple', 'stock', NULL, NULL)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyTransaction (id, userId, dateISO, accountId, amount, categoryId, kind, isGift, notes, detailsJSON, twinId) VALUES (1, ?, '2026-06-19', 1, 123.45, 2, 'expense', 0, 'Lunch', NULL, NULL)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyTransaction (id, userId, dateISO, accountId, amount, categoryId, kind, isGift, notes, detailsJSON, twinId) VALUES (2, ?, '2026-06-18', 1, 1000, NULL, 'invest_buy', 0, NULL, '{"assetId":1,"quantity":2}', NULL)`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	if _, err := db.Exec(`INSERT INTO moneyRateHistory (id, dateISO, ratesJson) VALUES (1, '2026-06-30', '{"RUB":1}')`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
}

func makeBase64PNG(t *testing.T, width int, height int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

func int64Ptr(value int64) *int64 {
	return &value
}

func stringPtr(value string) *string {
	return &value
}

func float64Ptr(value float64) *float64 {
	return &value
}

func assertMoneyValidationError(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %q", want)
	}
	if legacy.ErrorKindOf(err) != legacy.ErrorKindValidation {
		t.Fatalf("error kind = %q, want %q", legacy.ErrorKindOf(err), legacy.ErrorKindValidation)
	}
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func assertMoneyConflictError(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %q", want)
	}
	if legacy.ErrorKindOf(err) != legacy.ErrorKindConflict {
		t.Fatalf("error kind = %q, want %q", legacy.ErrorKindOf(err), legacy.ErrorKindConflict)
	}
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func mustMoneyJSONMap(t *testing.T, value *string) map[string]any {
	t.Helper()
	if value == nil {
		t.Fatal("value = nil")
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(*value), &result); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	return result
}

func assertMoneyTransactionCount(t *testing.T, db *sql.DB, want int64, query string, args ...any) {
	t.Helper()
	var got int64
	if err := db.QueryRow(query, args...).Scan(&got); err != nil {
		t.Fatalf("QueryRow() error = %v", err)
	}
	if got != want {
		t.Fatalf("transaction count = %d, want %d", got, want)
	}
}
