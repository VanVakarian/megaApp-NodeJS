package httpx

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
)

func TestRequestBodyLimitMiddlewareUsesMultipartLimit(t *testing.T) {
	router := chiRouterForLimitTest(64, 128)
	server := httptest.NewServer(router)
	defer server.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", `form-data; name="image"; filename="photo.png"`)
	headers.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(headers)
	if err != nil {
		t.Fatalf("CreatePart() error = %v", err)
	}
	if _, err := part.Write(bytes.Repeat([]byte("x"), 256)); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL, &body)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.StatusCode)
	}
}

func TestRequestBodyLimitMiddlewareUsesJSONLimit(t *testing.T) {
	router := chiRouterForLimitTest(32, 128)
	server := httptest.NewServer(router)
	defer server.Close()

	response, err := http.Post(server.URL, "application/json", strings.NewReader(`{"value":"`+strings.Repeat("a", 128)+`"}`))
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.StatusCode)
	}
}

func chiRouterForLimitTest(jsonLimit int64, multipartLimit int64) http.Handler {
	router := http.NewServeMux()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	return RequestBodyLimitMiddleware(jsonLimit, multipartLimit)(handlerWithMux(router, handler))
}

func handlerWithMux(mux *http.ServeMux, handler http.Handler) http.Handler {
	mux.Handle("/", handler)
	return mux
}
