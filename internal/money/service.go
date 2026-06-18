package money

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image/png"
	"strings"

	"megaapp-back/internal/httpx/legacy"

	"github.com/disintegration/imaging"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetSnapshot(ctx context.Context, userID int64) (Snapshot, error) {
	currencies, err := s.repo.ListCurrencies(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	categories, err := s.repo.ListCategories(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	organizations, err := s.repo.ListOrganizations(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	accounts, err := s.repo.ListAccounts(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	assets, err := s.repo.ListAssets(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	transactions, err := s.repo.ListTransactions(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}
	rateHistory, err := s.repo.ListRateHistory(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	investAssetTrades, err := s.repo.ListInvestAssetTrades(ctx, userID)
	if err != nil {
		return Snapshot{}, err
	}

	return Snapshot{
		Currencies:        currencies,
		Categories:        categories,
		Organizations:     organizations,
		Accounts:          accounts,
		Assets:            assets,
		InvestAssetTrades: investAssetTrades,
		Transactions:      transactions,
		RateHistory:       rateHistory,
	}, nil
}

func (s *Service) GetOrganizations(ctx context.Context, userID int64) ([]Organization, error) {
	return s.repo.ListOrganizations(ctx, userID)
}

func (s *Service) CreateOrganization(ctx context.Context, userID int64, input OrganizationInput) (int64, error) {
	normalized, err := validateOrganizationInput(input)
	if err != nil {
		return 0, err
	}
	return s.repo.CreateOrganization(ctx, userID, normalized)
}

func (s *Service) UpdateOrganization(ctx context.Context, userID int64, organizationID int64, input OrganizationInput) error {
	existing, err := s.repo.GetOrganizationByID(ctx, userID, organizationID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Organization not found")
	}

	normalized, err := validateOrganizationInput(input)
	if err != nil {
		return err
	}
	return s.repo.UpdateOrganization(ctx, userID, organizationID, normalized)
}

func (s *Service) DeleteOrganization(ctx context.Context, userID int64, organizationID int64) error {
	existing, err := s.repo.GetOrganizationByID(ctx, userID, organizationID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Organization not found")
	}

	linkedAccountsCount, err := s.repo.CountAccountsByOrganization(ctx, userID, organizationID)
	if err != nil {
		return err
	}
	if linkedAccountsCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Organization is linked to existing accounts")
	}

	return s.repo.DeleteOrganization(ctx, userID, organizationID)
}

func (s *Service) GetCurrencies(ctx context.Context, userID int64) ([]Currency, error) {
	return s.repo.ListCurrencies(ctx, userID)
}

func (s *Service) CreateCurrency(ctx context.Context, userID int64, input CurrencyInput) (int64, error) {
	normalized, err := validateCurrencyInput(input)
	if err != nil {
		return 0, err
	}
	return s.repo.CreateCurrency(ctx, userID, normalized)
}

func (s *Service) UpdateCurrency(ctx context.Context, userID int64, currencyID int64, input CurrencyInput) error {
	existing, err := s.repo.GetCurrencyByID(ctx, userID, currencyID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Currency not found")
	}

	normalized, err := validateCurrencyInput(input)
	if err != nil {
		return err
	}
	return s.repo.UpdateCurrency(ctx, userID, currencyID, normalized)
}

func (s *Service) DeleteCurrency(ctx context.Context, userID int64, currencyID int64) error {
	existing, err := s.repo.GetCurrencyByID(ctx, userID, currencyID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Currency not found")
	}

	linkedAccountsCount, err := s.repo.CountAccountsByCurrency(ctx, userID, currencyID)
	if err != nil {
		return err
	}
	if linkedAccountsCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Currency is linked to existing accounts")
	}

	return s.repo.DeleteCurrency(ctx, userID, currencyID)
}

func (s *Service) GetCategories(ctx context.Context, userID int64) ([]Category, error) {
	return s.repo.ListCategories(ctx, userID)
}

func (s *Service) CreateCategory(ctx context.Context, userID int64, input CategoryInput) (int64, error) {
	normalized, err := validateCategoryInput(input)
	if err != nil {
		return 0, err
	}
	if normalized.ParentID != nil {
		parentCategory, err := s.repo.GetCategoryByID(ctx, userID, *normalized.ParentID)
		if err != nil {
			return 0, err
		}
		if parentCategory == nil {
			return 0, legacy.NewError(legacy.ErrorKindValidation, "Parent category not found")
		}
		if parentCategory.CategoryType != normalized.CategoryType {
			return 0, legacy.NewError(legacy.ErrorKindValidation, "Parent category type must match categoryType")
		}
	}
	return s.repo.CreateCategory(ctx, userID, normalized)
}

func (s *Service) UpdateCategory(ctx context.Context, userID int64, categoryID int64, input CategoryInput) error {
	existing, err := s.repo.GetCategoryByID(ctx, userID, categoryID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Category not found")
	}

	normalized, err := validateCategoryInput(input)
	if err != nil {
		return err
	}
	if normalized.ParentID != nil && *normalized.ParentID == categoryID {
		return legacy.NewError(legacy.ErrorKindValidation, "Parent category cannot be the same as the category")
	}
	if normalized.ParentID != nil {
		parentCategory, err := s.repo.GetCategoryByID(ctx, userID, *normalized.ParentID)
		if err != nil {
			return err
		}
		if parentCategory == nil {
			return legacy.NewError(legacy.ErrorKindValidation, "Parent category not found")
		}
		if parentCategory.CategoryType != normalized.CategoryType {
			return legacy.NewError(legacy.ErrorKindValidation, "Parent category type must match categoryType")
		}
	}
	return s.repo.UpdateCategory(ctx, userID, categoryID, normalized)
}

func (s *Service) DeleteCategory(ctx context.Context, userID int64, categoryID int64) error {
	existing, err := s.repo.GetCategoryByID(ctx, userID, categoryID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Category not found")
	}

	childCategoriesCount, err := s.repo.CountChildCategories(ctx, userID, categoryID)
	if err != nil {
		return err
	}
	if childCategoriesCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Category has child categories")
	}

	linkedTransactionsCount, err := s.repo.CountTransactionsByCategory(ctx, userID, categoryID)
	if err != nil {
		return err
	}
	if linkedTransactionsCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Category is linked to existing transactions")
	}

	return s.repo.DeleteCategory(ctx, userID, categoryID)
}

func (s *Service) GetAccounts(ctx context.Context, userID int64) ([]Account, error) {
	return s.repo.ListAccounts(ctx, userID)
}

func (s *Service) CreateAccount(ctx context.Context, userID int64, input AccountInput) (int64, error) {
	normalized, err := validateAccountInput(input)
	if err != nil {
		return 0, err
	}
	if err := s.ensureAccountReferences(ctx, userID, normalized); err != nil {
		return 0, err
	}
	return s.repo.CreateAccount(ctx, userID, normalized)
}

func (s *Service) UpdateAccount(ctx context.Context, userID int64, accountID int64, input AccountInput) error {
	existing, err := s.repo.GetAccountByID(ctx, userID, accountID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Account not found")
	}

	normalized, err := validateAccountInput(input)
	if err != nil {
		return err
	}
	if err := s.ensureAccountReferences(ctx, userID, normalized); err != nil {
		return err
	}
	return s.repo.UpdateAccount(ctx, userID, accountID, normalized)
}

func (s *Service) DeleteAccount(ctx context.Context, userID int64, accountID int64) error {
	existing, err := s.repo.GetAccountByID(ctx, userID, accountID)
	if err != nil {
		return err
	}
	if existing == nil {
		return legacy.NewError(legacy.ErrorKindNotFound, "Account not found")
	}

	linkedTransactionsCount, err := s.repo.CountTransactionsByAccount(ctx, userID, accountID)
	if err != nil {
		return err
	}
	if linkedTransactionsCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Account is linked to existing transactions")
	}

	linkedAssetsCount, err := s.repo.CountAssetsByAccount(ctx, userID, accountID)
	if err != nil {
		return err
	}
	if linkedAssetsCount > 0 {
		return legacy.NewError(legacy.ErrorKindConflict, "Account is linked to existing assets")
	}

	return s.repo.DeleteAccount(ctx, userID, accountID)
}

func (s *Service) ensureAccountReferences(ctx context.Context, userID int64, input AccountInput) error {
	currency, err := s.repo.GetCurrencyByID(ctx, userID, input.CurrencyID)
	if err != nil {
		return err
	}
	if currency == nil {
		return legacy.NewError(legacy.ErrorKindValidation, "Currency not found")
	}
	if input.OrganizationID == nil {
		return nil
	}
	organization, err := s.repo.GetOrganizationByID(ctx, userID, *input.OrganizationID)
	if err != nil {
		return err
	}
	if organization == nil {
		return legacy.NewError(legacy.ErrorKindValidation, "Organization not found")
	}
	return nil
}

func validateOrganizationInput(input OrganizationInput) (OrganizationInput, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return OrganizationInput{}, missingFieldsError("title")
	}

	logo, err := normalizeLogoBase64(input.LogoBase64)
	if err != nil {
		return OrganizationInput{}, err
	}

	return OrganizationInput{Title: title, LogoBase64: logo}, nil
}

func validateCurrencyInput(input CurrencyInput) (CurrencyInput, error) {
	title := strings.TrimSpace(input.Title)
	ticker := strings.TrimSpace(input.Ticker)
	symbol := strings.TrimSpace(input.Symbol)

	var missing []string
	if title == "" {
		missing = append(missing, "title")
	}
	if ticker == "" {
		missing = append(missing, "ticker")
	}
	if symbol == "" {
		missing = append(missing, "symbol")
	}
	if len(missing) > 0 {
		return CurrencyInput{}, missingFieldsError(missing...)
	}
	if input.SymbolPosEnum != SymbolPositionBefore && input.SymbolPosEnum != SymbolPositionAfter {
		return CurrencyInput{}, legacy.NewError(legacy.ErrorKindValidation, `symbolPosEnum must be either "before" or "after"`)
	}

	return CurrencyInput{
		Title:         title,
		Ticker:        ticker,
		Symbol:        symbol,
		SymbolPosEnum: input.SymbolPosEnum,
		Whitespace:    input.Whitespace,
	}, nil
}

func validateCategoryInput(input CategoryInput) (CategoryInput, error) {
	name := strings.TrimSpace(input.Name)

	var missing []string
	if name == "" {
		missing = append(missing, "name")
	}
	if input.CategoryType == "" {
		missing = append(missing, "categoryType")
	}
	if len(missing) > 0 {
		return CategoryInput{}, missingFieldsError(missing...)
	}
	if input.CategoryType != CategoryTypeIncome && input.CategoryType != CategoryTypeExpense {
		return CategoryInput{}, legacy.NewError(legacy.ErrorKindValidation, "categoryType must be one of: income, expense")
	}
	if input.ParentID != nil && *input.ParentID <= 0 {
		return CategoryInput{}, legacy.NewError(legacy.ErrorKindValidation, "Parent category not found")
	}

	return CategoryInput{Name: name, ParentID: input.ParentID, CategoryType: input.CategoryType}, nil
}

func validateAccountInput(input AccountInput) (AccountInput, error) {
	title := strings.TrimSpace(input.Title)

	var missing []string
	if title == "" {
		missing = append(missing, "title")
	}
	if input.CurrencyID <= 0 {
		missing = append(missing, "currencyId")
	}
	if input.Kind == "" {
		missing = append(missing, "kind")
	}
	if len(missing) > 0 {
		return AccountInput{}, missingFieldsError(missing...)
	}
	if !isValidAccountKind(input.Kind) {
		return AccountInput{}, legacy.NewError(legacy.ErrorKindValidation, "kind must be one of: cash, card, checking, deposit, brokerage, crypto")
	}
	if input.OrganizationID != nil && *input.OrganizationID <= 0 {
		return AccountInput{}, legacy.NewError(legacy.ErrorKindValidation, "Organization not found")
	}

	return AccountInput{
		Title:          title,
		CurrencyID:     input.CurrencyID,
		IsInvest:       input.IsInvest,
		IsArchived:     input.IsArchived,
		Kind:           input.Kind,
		OrganizationID: input.OrganizationID,
	}, nil
}

func isValidAccountKind(kind AccountKind) bool {
	switch kind {
	case AccountKindCash, AccountKindCard, AccountKindChecking, AccountKindDeposit, AccountKindBrokerage, AccountKindCrypto:
		return true
	default:
		return false
	}
}

func missingFieldsError(fields ...string) error {
	return legacy.NewError(legacy.ErrorKindValidation, fmt.Sprintf("Missing required fields: %s", strings.Join(fields, ", ")))
}

func normalizeLogoBase64(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}

	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "Invalid logoBase64")
	}

	imageData, err := imaging.Decode(bytes.NewReader(decoded), imaging.AutoOrientation(true))
	if err != nil {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "Invalid logoBase64")
	}
	if imageData.Bounds().Dx() <= 32 && imageData.Bounds().Dy() <= 32 {
		return &trimmed, nil
	}

	resized := imaging.Fill(imageData, 32, 32, imaging.Center, imaging.Lanczos)
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, resized); err != nil {
		return nil, legacy.WrapError(legacy.ErrorKindInternal, "Failed to process organization logo", err)
	}
	encoded := base64.StdEncoding.EncodeToString(buffer.Bytes())
	return &encoded, nil
}
