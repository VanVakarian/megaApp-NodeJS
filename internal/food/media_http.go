package food

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

func (h *CatalogueHandler) AnalyzeImage(w http.ResponseWriter, r *http.Request) {
	fileData, mimeType, err := extractUploadedImage(r)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid image upload")
		return
	}

	response, err := h.service.AnalyzeImage(r.Context(), fileData, mimeType)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

type ImageHandler struct {
	store *ImageStore
}

func NewImageHandler(store *ImageStore) *ImageHandler {
	return &ImageHandler{store: store}
}

func RegisterImageRoutes(router chi.Router, handler *ImageHandler) {
	if handler == nil {
		return
	}
	router.Get("/api/images/food/{filename}", handler.ServeFoodImage)
}

func (h *ImageHandler) ServeFoodImage(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimSpace(chi.URLParam(r, "filename"))
	path, err := h.store.VariantPath(filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}

func extractUploadedImage(r *http.Request) ([]byte, string, error) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, "", legacy.NewError(legacy.ErrorKindRequestTooLarge, "Request body is too large")
		}
		return nil, "", legacy.WrapError(legacy.ErrorKindValidation, "Invalid multipart form", err)
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	file, header, err := openUploadedImage(r.MultipartForm)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()

	buffer, err := io.ReadAll(file)
	if err != nil {
		return nil, "", legacy.WrapError(legacy.ErrorKindValidation, "Failed to read uploaded image", err)
	}
	if len(buffer) == 0 {
		return nil, "", legacy.NewError(legacy.ErrorKindValidation, "No image file provided")
	}

	mimeType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if mimeType == "" {
		mimeType = http.DetectContentType(buffer)
	}
	if !strings.HasPrefix(strings.ToLower(mimeType), "image/") {
		return nil, "", legacy.NewError(legacy.ErrorKindValidation, "File must be an image")
	}
	return buffer, mimeType, nil
}

func openUploadedImage(form *multipart.Form) (multipart.File, *multipart.FileHeader, error) {
	if form == nil || len(form.File) == 0 {
		return nil, nil, legacy.NewError(legacy.ErrorKindValidation, "No image file provided")
	}
	if files := form.File["image"]; len(files) > 0 {
		return openMultipartFile(files[0])
	}
	keys := make([]string, 0, len(form.File))
	for key := range form.File {
		keys = append(keys, key)
	}
	for _, key := range keys {
		files := form.File[key]
		if len(files) == 0 {
			continue
		}
		return openMultipartFile(files[0])
	}
	return nil, nil, legacy.NewError(legacy.ErrorKindValidation, "No image file provided")
}

func openMultipartFile(header *multipart.FileHeader) (multipart.File, *multipart.FileHeader, error) {
	if header == nil {
		return nil, nil, legacy.NewError(legacy.ErrorKindValidation, "No image file provided")
	}
	file, err := header.Open()
	if err != nil {
		return nil, nil, legacy.WrapError(legacy.ErrorKindValidation, fmt.Sprintf("Failed to open %s", filepath.Base(header.Filename)), err)
	}
	return file, header, nil
}
