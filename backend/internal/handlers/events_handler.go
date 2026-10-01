package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/services"
)

// EventsHandler streams server-sent events so the UI shows new mail without polling.
type EventsHandler struct {
	hub       *services.EventHub
	heartbeat time.Duration
}

// NewEventsHandler builds the SSE handler. heartbeat keeps idle connections open
// through proxies (nginx closes reads after 60s by default).
func NewEventsHandler(hub *services.EventHub, heartbeat time.Duration) *EventsHandler {
	return &EventsHandler{hub: hub, heartbeat: heartbeat}
}

// Stream handles GET /api/events.
func (h *EventsHandler) Stream(c fiber.Ctx) error {
	c.Set(fiber.HeaderContentType, "text/event-stream")
	c.Set(fiber.HeaderCacheControl, "no-cache")
	c.Set(fiber.HeaderConnection, "keep-alive")
	// Tells nginx not to buffer the stream
	c.Set("X-Accel-Buffering", "no")

	events, unsubscribe := h.hub.Subscribe()
	return c.SendStreamWriter(func(w *bufio.Writer) {
		defer unsubscribe()
		ticker := time.NewTicker(h.heartbeat)
		defer ticker.Stop()

		// Sent at once so the client knows the stream is live
		if writeComment(w, "connected") != nil {
			return
		}
		for {
			select {
			case event, ok := <-events:
				if !ok {
					return
				}
				if writeEvent(w, event) != nil {
					return // client went away
				}
			case <-ticker.C:
				if writeComment(w, "ping") != nil {
					return
				}
			}
		}
	})
}

func writeEvent(w *bufio.Writer, event services.Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data); err != nil {
		return err
	}
	return w.Flush()
}

func writeComment(w *bufio.Writer, text string) error {
	if _, err := fmt.Fprintf(w, ": %s\n\n", text); err != nil {
		return err
	}
	return w.Flush()
}
