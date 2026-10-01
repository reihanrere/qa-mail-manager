package services

import "testing"

func TestEventHubFanOutAndUnsubscribe(t *testing.T) {
	hub := NewEventHub()
	a, cancelA := hub.Subscribe()
	b, cancelB := hub.Subscribe()
	defer cancelB()

	hub.Publish(Event{Type: EventMessageCreated, AccountID: "1"})
	if got := <-a; got.AccountID != "1" {
		t.Fatalf("a got %+v", got)
	}
	if got := <-b; got.AccountID != "1" {
		t.Fatalf("b got %+v", got)
	}

	cancelA()
	cancelA() // idempotent
	if _, open := <-a; open {
		t.Fatal("expected a closed channel after unsubscribe")
	}
	if hub.Subscribers() != 1 {
		t.Fatalf("expected 1 subscriber, got %d", hub.Subscribers())
	}
}

func TestEventHubDropsForSlowSubscriber(t *testing.T) {
	hub := NewEventHub()
	ch, cancel := hub.Subscribe()
	defer cancel()
	for i := 0; i < eventBuffer+10; i++ {
		hub.Publish(Event{Type: EventAccountsChanged}) // must never block
	}
	if len(ch) != eventBuffer {
		t.Fatalf("expected a full buffer of %d, got %d", eventBuffer, len(ch))
	}
}

func TestNilHubPublishIsNoop(t *testing.T) {
	var hub *EventHub
	hub.Publish(Event{Type: EventAccountsChanged})
}
