package food

import (
	"context"
	"strings"

	"megaapp-back/internal/httpx/legacy"
)

func (s *Service) AnalyzeImage(ctx context.Context, imageData []byte, mimeType string) (*ImageAnalysisData, error) {
	if len(imageData) == 0 {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "No image file provided")
	}
	if s.imageAnalyzer == nil {
		return nil, legacy.NewError(legacy.ErrorKindInternal, "Image analyzer is not configured")
	}
	productName, err := s.imageAnalyzer.AnalyzeFoodImage(ctx, imageData, mimeType)
	if err != nil {
		return nil, legacy.WrapError(legacy.ErrorKindExternal, "Failed to analyze image", err)
	}
	productName = strings.TrimSpace(productName)
	if productName == "" {
		return nil, nil
	}
	searchResults, err := s.SearchCatalogue(ctx, productName)
	if err != nil {
		return nil, legacy.WrapError(legacy.ErrorKindInternal, "Failed to search catalogue", err)
	}
	return &ImageAnalysisData{DetectedProductName: productName, SearchResults: searchResults, SearchQuery: productName}, nil
}
