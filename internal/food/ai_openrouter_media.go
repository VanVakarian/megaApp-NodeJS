package food

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

type OpenRouterMediaClientConfig struct {
	APIKey      string
	VisionModel string
	ImageModel  string
	Timeout     time.Duration
	Logger      *slog.Logger
}

type OpenRouterMediaClient struct {
	client      *openai.Client
	httpClient  *http.Client
	apiKey      string
	visionModel string
	imageModel  string
	logger      *slog.Logger
}

type aiMediaChatCompletionRequest struct {
	Model      string               `json:"model"`
	Messages   []aiMediaChatMessage `json:"messages"`
	Modalities []string             `json:"modalities,omitempty"`
}

type aiMediaChatMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type aiMediaTextPart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type aiMediaImagePart struct {
	Type     string             `json:"type"`
	ImageURL aiMediaImageDetail `json:"image_url"`
}

type aiMediaImageDetail struct {
	URL    string `json:"url"`
	Detail string `json:"detail,omitempty"`
}

type aiMediaChatCompletionResponse struct {
	Choices []aiMediaChoice `json:"choices"`
}

type aiMediaChoice struct {
	Message aiMediaResponseMessage `json:"message"`
}

type aiMediaResponseMessage struct {
	Content string         `json:"content"`
	Images  []aiMediaImage `json:"images"`
}

type aiMediaImage struct {
	ImageURL aiMediaImageURL `json:"image_url"`
}

type aiMediaImageURL struct {
	URL string `json:"url"`
}

type aiImageRecognitionPayload struct {
	ProductName string `json:"productName"`
}

func NewOpenRouterMediaClient(cfg OpenRouterMediaClientConfig) (*OpenRouterMediaClient, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, errors.New("openrouter api key is required")
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 60 * time.Second
	}
	httpClient := &http.Client{Timeout: cfg.Timeout}
	client := openai.NewClient(
		option.WithAPIKey(cfg.APIKey),
		option.WithBaseURL(openRouterBaseURL),
		option.WithHTTPClient(httpClient),
		option.WithHeader("X-Title", "megaapp-back"),
	)
	return &OpenRouterMediaClient{
		client:      &client,
		httpClient:  httpClient,
		apiKey:      cfg.APIKey,
		visionModel: strings.TrimSpace(cfg.VisionModel),
		imageModel:  strings.TrimSpace(cfg.ImageModel),
		logger:      cfg.Logger,
	}, nil
}

func (c *OpenRouterMediaClient) AnalyzeFoodImage(ctx context.Context, imageData []byte, mimeType string) (string, error) {
	if c.visionModel == "" {
		c.logger.Debug("vision analysis skipped: model not configured")
		return "", errors.New("openrouter vision model is not configured")
	}
	request := aiMediaChatCompletionRequest{
		Model: c.visionModel,
		Messages: []aiMediaChatMessage{
			{Role: "system", Content: []aiMediaTextPart{{Type: "text", Text: "You analyze food photos. Respond with JSON only. Return {\"productName\":\"\"} if no recognizable food product is present. Otherwise return {\"productName\":\"<generalized Russian product name>\"}."}}},
			{Role: "user", Content: []any{
				aiMediaTextPart{Type: "text", Text: "Detect the main food product in this image and answer with JSON only."},
				aiMediaImagePart{Type: "image_url", ImageURL: aiMediaImageDetail{URL: buildImageDataURL(imageData, mimeType), Detail: "low"}},
			}},
		},
	}
	c.logger.Debug("vision analysis request built", "model", c.visionModel, "imageBytes", len(imageData), "mimeType", mimeType)

	start := time.Now()
	var response aiMediaChatCompletionResponse
	if err := c.client.Post(ctx, "chat/completions", request, &response); err != nil {
		c.logger.Error("vision analysis request failed", "model", c.visionModel, "duration", time.Since(start), "error", err)
		return "", fmt.Errorf("openrouter image analysis request failed: %w", err)
	}
	duration := time.Since(start)
	c.logger.Debug("vision analysis response received", "model", c.visionModel, "duration", duration, "choicesCount", len(response.Choices))
	if len(response.Choices) == 0 {
		c.logger.Error("vision analysis returned no choices", "model", c.visionModel, "duration", duration)
		return "", errors.New("openrouter returned no choices")
	}
	payload, err := extractJSON(response.Choices[0].Message.Content)
	if err != nil {
		trimmed := strings.TrimSpace(response.Choices[0].Message.Content)
		if strings.EqualFold(trimmed, "no_food") || strings.EqualFold(trimmed, "none") {
			c.logger.Debug("vision analysis found no food in image")
			return "", nil
		}
		c.logger.Error("vision analysis response parse failed", "model", c.visionModel, "content", response.Choices[0].Message.Content, "error", err)
		return "", err
	}
	var parsed aiImageRecognitionPayload
	if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
		c.logger.Error("vision analysis json unmarshal failed", "model", c.visionModel, "payload", payload, "error", err)
		return "", fmt.Errorf("parse image analysis json: %w", err)
	}
	c.logger.Debug("vision analysis parsed", "model", c.visionModel, "productName", parsed.ProductName)
	return strings.TrimSpace(parsed.ProductName), nil
}

func (c *OpenRouterMediaClient) GenerateFoodImage(ctx context.Context, prompt string) (GeneratedImage, error) {
	if c.imageModel == "" {
		c.logger.Debug("image generation skipped: model not configured")
		return GeneratedImage{}, errors.New("openrouter image model is not configured")
	}
	request := aiMediaChatCompletionRequest{
		Model:      c.imageModel,
		Messages:   []aiMediaChatMessage{{Role: "user", Content: prompt}},
		Modalities: []string{"image"},
	}
	c.logger.Debug("image generation request built", "model", c.imageModel, "promptLength", len(prompt))

	start := time.Now()
	var response aiMediaChatCompletionResponse
	if err := c.client.Post(ctx, "chat/completions", request, &response); err != nil {
		c.logger.Error("image generation request failed", "model", c.imageModel, "duration", time.Since(start), "error", err)
		return GeneratedImage{}, fmt.Errorf("openrouter image generation request failed: %w", err)
	}
	duration := time.Since(start)
	choicesCount := len(response.Choices)
	imagesCount := 0
	if choicesCount > 0 {
		imagesCount = len(response.Choices[0].Message.Images)
	}
	c.logger.Debug("image generation response received", "model", c.imageModel, "duration", duration, "choicesCount", choicesCount, "imagesCount", imagesCount)
	if choicesCount == 0 || imagesCount == 0 {
		c.logger.Error("image generation returned no image data", "model", c.imageModel, "duration", duration, "choicesCount", choicesCount, "imagesCount", imagesCount)
		return GeneratedImage{}, errors.New("openrouter returned no image data")
	}
	imageURL := strings.TrimSpace(response.Choices[0].Message.Images[0].ImageURL.URL)
	format, payload, err := parseDataImageURL(imageURL)
	if err != nil {
		c.logger.Error("image generation url parse failed", "model", c.imageModel, "error", err)
		return GeneratedImage{}, err
	}
	buffer, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		c.logger.Error("image generation base64 decode failed", "model", c.imageModel, "format", format, "error", err)
		return GeneratedImage{}, fmt.Errorf("decode generated image: %w", err)
	}
	c.logger.Debug("image generation decoded", "model", c.imageModel, "format", format, "bytes", len(buffer))
	return GeneratedImage{Data: buffer, Format: format, Model: c.imageModel, Provider: "openrouter"}, nil
}

func (c *OpenRouterMediaClient) CheckRateLimits(ctx context.Context) (map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, openRouterBaseURL+"/auth/key", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("openrouter auth key request failed with status %d", response.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func buildImageDataURL(data []byte, mimeType string) string {
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func parseDataImageURL(value string) (string, string, error) {
	if !strings.HasPrefix(value, "data:image/") {
		return "", "", errors.New("invalid image URL format from OpenRouter")
	}
	trimmed := strings.TrimPrefix(value, "data:image/")
	parts := strings.SplitN(trimmed, ";base64,", 2)
	if len(parts) != 2 {
		return "", "", errors.New("failed to parse base64 image data from OpenRouter")
	}
	return strings.ToLower(parts[0]), parts[1], nil
}
