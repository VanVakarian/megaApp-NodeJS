package money

type SymbolPosition string

const (
	SymbolPositionBefore SymbolPosition = "before"
	SymbolPositionAfter  SymbolPosition = "after"
)

type CategoryType string

const (
	CategoryTypeIncome  CategoryType = "income"
	CategoryTypeExpense CategoryType = "expense"
)

type AccountKind string

const (
	AccountKindCash      AccountKind = "cash"
	AccountKindCard      AccountKind = "card"
	AccountKindChecking  AccountKind = "checking"
	AccountKindDeposit   AccountKind = "deposit"
	AccountKindBrokerage AccountKind = "brokerage"
	AccountKindCrypto    AccountKind = "crypto"
)

type AssetType string

const (
	AssetTypeStock  AssetType = "stock"
	AssetTypeBond   AssetType = "bond"
	AssetTypeCrypto AssetType = "crypto"
)

type TransactionKind string

const (
	TransactionKindIncome         TransactionKind = "income"
	TransactionKindExpense        TransactionKind = "expense"
	TransactionKindTransfer       TransactionKind = "transfer"
	TransactionKindInvestBuy      TransactionKind = "invest_buy"
	TransactionKindInvestSell     TransactionKind = "invest_sell"
	TransactionKindInvestDividend TransactionKind = "invest_dividend"
)

type Organization struct {
	ID         int64   `json:"id"`
	Title      string  `json:"title"`
	LogoBase64 *string `json:"logoBase64"`
}

type Currency struct {
	ID            int64          `json:"id"`
	Title         string         `json:"title"`
	Ticker        string         `json:"ticker"`
	Symbol        string         `json:"symbol"`
	SymbolPosEnum SymbolPosition `json:"symbolPosEnum"`
	Whitespace    bool           `json:"whitespace"`
}

type Category struct {
	ID           int64        `json:"id"`
	Name         string       `json:"name"`
	ParentID     *int64       `json:"parentId"`
	CategoryType CategoryType `json:"categoryType"`
}

type Account struct {
	ID             int64       `json:"id"`
	Title          string      `json:"title"`
	CurrencyID     int64       `json:"currencyId"`
	IsInvest       bool        `json:"isInvest"`
	IsArchived     bool        `json:"isArchived"`
	Kind           AccountKind `json:"kind"`
	OrganizationID *int64      `json:"organizationId"`
}

type Asset struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Ticker         string    `json:"ticker"`
	Type           AssetType `json:"type"`
	AccountIDs     []int64   `json:"accountIds"`
	SuspendedSince *string   `json:"suspendedSince"`
	SuspendedUntil *string   `json:"suspendedUntil"`
}

type Transaction struct {
	ID          int64           `json:"id"`
	DateISO     string          `json:"dateISO"`
	AccountID   int64           `json:"accountId"`
	Amount      float64         `json:"amount"`
	CategoryID  *int64          `json:"categoryId"`
	Kind        TransactionKind `json:"kind"`
	IsGift      bool            `json:"isGift"`
	Notes       *string         `json:"notes"`
	DetailsJSON *string         `json:"detailsJSON"`
	TwinID      *int64          `json:"twinId"`
}

type InvestAssetTrade struct {
	ID          int64           `json:"id"`
	DateISO     string          `json:"dateISO"`
	AccountID   int64           `json:"accountId"`
	Amount      float64         `json:"amount"`
	Kind        TransactionKind `json:"kind"`
	Notes       *string         `json:"notes"`
	DetailsJSON *string         `json:"detailsJSON"`
	AssetID     *int64          `json:"assetId"`
	AssetTitle  *string         `json:"assetTitle"`
	AssetTicker *string         `json:"assetTicker"`
	AssetType   *string         `json:"assetType"`
}

type RateHistory struct {
	ID        int64  `json:"id"`
	DateISO   string `json:"dateISO"`
	RatesJSON string `json:"ratesJson"`
}

type Snapshot struct {
	Currencies        []Currency         `json:"currencies"`
	Categories        []Category         `json:"categories"`
	Organizations     []Organization     `json:"organizations"`
	Accounts          []Account          `json:"accounts"`
	Assets            []Asset            `json:"assets"`
	InvestAssetTrades []InvestAssetTrade `json:"investAssetTrades"`
	Transactions      []Transaction      `json:"transactions"`
	RateHistory       []RateHistory      `json:"rateHistory"`
}

type OrganizationInput struct {
	Title      string  `json:"title"`
	LogoBase64 *string `json:"logoBase64"`
}

type CurrencyInput struct {
	Title         string         `json:"title"`
	Ticker        string         `json:"ticker"`
	Symbol        string         `json:"symbol"`
	SymbolPosEnum SymbolPosition `json:"symbolPosEnum"`
	Whitespace    bool           `json:"whitespace"`
}

type CategoryInput struct {
	Name         string       `json:"name"`
	ParentID     *int64       `json:"parentId"`
	CategoryType CategoryType `json:"categoryType"`
}

type AccountInput struct {
	Title          string      `json:"title"`
	CurrencyID     int64       `json:"currencyId"`
	IsInvest       bool        `json:"isInvest"`
	IsArchived     bool        `json:"isArchived"`
	Kind           AccountKind `json:"kind"`
	OrganizationID *int64      `json:"organizationId"`
}

type AssetInput struct {
	Title          string    `json:"title"`
	Ticker         string    `json:"ticker"`
	Type           AssetType `json:"type"`
	AccountIDs     []int64   `json:"accountIds"`
	SuspendedSince *string   `json:"suspendedSince"`
	SuspendedUntil *string   `json:"suspendedUntil"`
}

type TransactionInput struct {
	DateISO           string          `json:"dateISO"`
	AccountID         int64           `json:"accountId"`
	Amount            float64         `json:"amount"`
	TwinAccountID     *int64          `json:"twinAccountId"`
	TwinAmount        *float64        `json:"twinAmount"`
	CategoryID        *int64          `json:"categoryId"`
	Kind              TransactionKind `json:"kind"`
	IsGift            bool            `json:"isGift"`
	Notes             *string         `json:"notes"`
	DetailsJSON       any             `json:"detailsJSON"`
	StoredDetailsJSON *string         `json:"-"`
}

type CreateTransactionResult struct {
	ID     int64
	TwinID *int64
}
