package services

import (
	"errors"
	"fmt"
)

// ValidationError is a rejected request. Code is a stable identifier the frontend
// translates, Params fill its placeholders, and the message stays as the English
// fallback for API clients. It matches ErrInvalidInput with errors.Is.
type ValidationError struct {
	Code    string
	Params  map[string]any
	message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%v: %s", ErrInvalidInput, e.message)
}

func (e *ValidationError) Unwrap() error { return ErrInvalidInput }

// invalid builds a ValidationError; format and args make the English message.
func invalid(code string, params map[string]any, format string, args ...any) error {
	return &ValidationError{Code: code, Params: params, message: fmt.Sprintf(format, args...)}
}

// AsValidationError returns the ValidationError inside err, if any.
func AsValidationError(err error) (*ValidationError, bool) {
	var v *ValidationError
	ok := errors.As(err, &v)
	return v, ok
}
