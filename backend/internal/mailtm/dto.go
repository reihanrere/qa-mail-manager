package mailtm

// Domain represents a Mail.tm domain resource.
type Domain struct {
	ID       string `json:"id"`
	Domain   string `json:"domain"`
	IsActive bool   `json:"isActive"`
}

// createAccountRequest is the body sent to POST /accounts.
type createAccountRequest struct {
	Address  string `json:"address"`
	Password string `json:"password"`
}

// Account represents a Mail.tm account resource.
type Account struct {
	ID      string `json:"id"`
	Address string `json:"address"`
}

// tokenRequest is the body sent to POST /token.
type tokenRequest struct {
	Address  string `json:"address"`
	Password string `json:"password"`
}

// tokenResponse is the body returned by POST /token.
type tokenResponse struct {
	Token string `json:"token"`
}

// Address is a sender or recipient on a message.
type Address struct {
	Address string `json:"address"`
	Name    string `json:"name"`
}

// MessageSummary represents a single item in the inbox message list.
type MessageSummary struct {
	ID        string  `json:"id"`
	Subject   string  `json:"subject"`
	Intro     string  `json:"intro"`
	Seen      bool    `json:"seen"`
	CreatedAt string  `json:"createdAt"`
	From      Address `json:"from"`
}

// MessagePage is one page of GET /messages in JSON-LD form, which carries the total count.
type MessagePage struct {
	Members    []MessageSummary `json:"hydra:member"`
	TotalItems int              `json:"hydra:totalItems"`
}

// MessagesPerPage is Mail.tm's fixed page size for GET /messages.
const MessagesPerPage = 30

// MessageDetail represents the full body of a single message.
type MessageDetail struct {
	ID          string       `json:"id"`
	Subject     string       `json:"subject"`
	Seen        bool         `json:"seen"`
	From        Address      `json:"from"`
	To          []Address    `json:"to"`
	Text        string       `json:"text"`
	HTML        []string     `json:"html"`
	Attachments []Attachment `json:"attachments"`
	CreatedAt   string       `json:"createdAt"`
}

// Attachment describes a file attached to a message. DownloadURL is Mail.tm's own
// relative path; providers clear it before the detail reaches the frontend.
type Attachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	// Size in bytes
	Size int `json:"size"`
	// ContentID lets the UI resolve "cid:" image references in the HTML body.
	ContentID   string `json:"contentId,omitempty"`
	DownloadURL string `json:"downloadUrl,omitempty"`
}

// markSeenRequest is the merge-patch body sent to PATCH /messages/{id}.
type markSeenRequest struct {
	Seen bool `json:"seen"`
}

// errorResponse captures Mail.tm's error body for clearer error messages.
type errorResponse struct {
	Detail           string `json:"detail"`
	HydraDescription string `json:"hydra:description"`
	Title            string `json:"title"`
	// Message is used by Mail.tm's auth layer, e.g. {"code":401,"message":"Invalid credentials."}
	Message string `json:"message"`
}

func (e errorResponse) message() string {
	switch {
	case e.Detail != "":
		return e.Detail
	case e.HydraDescription != "":
		return e.HydraDescription
	case e.Title != "":
		return e.Title
	case e.Message != "":
		return e.Message
	default:
		return "unknown Mail.tm error"
	}
}
