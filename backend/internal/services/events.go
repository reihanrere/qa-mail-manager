package services

import (
	"sync"
)

// Event types pushed to the UI over GET /api/events.
const (
	// EventMessageCreated: new mail arrived (ingest stored it, or a sync saw the count grow).
	EventMessageCreated = "message.created"
	// EventAccountsChanged: account list or counts changed (generate, replace, delete).
	EventAccountsChanged = "accounts.changed"
	// EventSettingsChanged: settings were edited from the Settings page.
	EventSettingsChanged = "settings.changed"
)

// Event is one server-sent event.
type Event struct {
	Type         string `json:"type"`
	AccountID    string `json:"accountId,omitempty"`
	AccountEmail string `json:"accountEmail,omitempty"`
	Subject      string `json:"subject,omitempty"`
}

// eventBuffer is how many events a slow subscriber may lag behind before events are
// dropped for it; the UI re-fetches on its polling interval anyway.
const eventBuffer = 32

// EventHub fans out events to every connected UI.
type EventHub struct {
	mu          sync.Mutex
	subscribers map[chan Event]struct{}
}

// NewEventHub builds an empty hub.
func NewEventHub() *EventHub {
	return &EventHub{subscribers: map[chan Event]struct{}{}}
}

// Subscribe returns a channel of events and a function that unsubscribes and closes it.
func (h *EventHub) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, eventBuffer)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	return ch, func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subscribers, ch)
			h.mu.Unlock()
			close(ch)
		})
	}
}

// Publish delivers the event to every subscriber without blocking; a full subscriber
// misses the event rather than stalling the publisher.
func (h *EventHub) Publish(event Event) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

// Subscribers reports how many UIs are connected (for tests and diagnostics).
func (h *EventHub) Subscribers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subscribers)
}
