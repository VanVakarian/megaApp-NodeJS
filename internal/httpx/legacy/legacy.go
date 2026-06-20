package legacy

import (
	"encoding/json"
	"errors"
	"net/http"
)

type ErrorKind string

const (
	ErrorKindValidation      ErrorKind = "validation"
	ErrorKindUnauthorized    ErrorKind = "unauthorized"
	ErrorKindNotFound        ErrorKind = "not_found"
	ErrorKindConflict        ErrorKind = "conflict"
	ErrorKindInternal        ErrorKind = "internal"
	ErrorKindExternal        ErrorKind = "external"
	ErrorKindRequestTooLarge ErrorKind = "request_too_large"
)

type AppError struct {
	Kind    ErrorKind
	Message string
	Cause   error
}

func (e *AppError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return string(e.Kind)
}

func (e *AppError) Unwrap() error {
	return e.Cause
}

func NewError(kind ErrorKind, message string) error {
	return &AppError{Kind: kind, Message: message}
}

func WrapError(kind ErrorKind, message string, cause error) error {
	return &AppError{Kind: kind, Message: message, Cause: cause}
}

func ErrorKindOf(err error) ErrorKind {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Kind
	}
	return ""
}

func ErrorMessageOf(err error, fallback string) string {
	var appErr *AppError
	if errors.As(err, &appErr) && appErr.Message != "" {
		return appErr.Message
	}
	if fallback != "" {
		return fallback
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func ErrorStatusCodeOf(err error, fallback int) int {
	switch ErrorKindOf(err) {
	case ErrorKindValidation:
		return http.StatusBadRequest
	case ErrorKindUnauthorized:
		return http.StatusUnauthorized
	case ErrorKindNotFound:
		return http.StatusNotFound
	case ErrorKindConflict:
		return http.StatusConflict
	case ErrorKindExternal:
		return http.StatusBadGateway
	case ErrorKindRequestTooLarge:
		return http.StatusRequestEntityTooLarge
	case ErrorKindInternal:
		return http.StatusInternalServerError
	default:
		return fallback
	}
}

func WriteJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteMessage(w http.ResponseWriter, statusCode int, message string) {
	WriteJSON(w, statusCode, map[string]string{"message": message})
}

func WriteDetail(w http.ResponseWriter, statusCode int, detail string) {
	WriteJSON(w, statusCode, map[string]string{"detail": detail})
}

func WriteResultError(w http.ResponseWriter, statusCode int, message string) {
	WriteJSON(w, statusCode, map[string]any{"result": false, "error": message})
}

func WriteAppMessageError(w http.ResponseWriter, err error, fallbackStatus int, fallbackMessage string) {
	WriteMessage(w, ErrorStatusCodeOf(err, fallbackStatus), ErrorMessageOf(err, fallbackMessage))
}

func WriteAppDetailError(w http.ResponseWriter, err error, fallbackStatus int, fallbackMessage string) {
	WriteDetail(w, ErrorStatusCodeOf(err, fallbackStatus), ErrorMessageOf(err, fallbackMessage))
}

func WriteAppResultError(w http.ResponseWriter, err error, fallbackStatus int, fallbackMessage string) {
	WriteResultError(w, ErrorStatusCodeOf(err, fallbackStatus), ErrorMessageOf(err, fallbackMessage))
}

func DecodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return NewError(ErrorKindRequestTooLarge, "Request body is too large")
		}
		return WrapError(ErrorKindValidation, "Invalid request body", err)
	}
	return nil
}
