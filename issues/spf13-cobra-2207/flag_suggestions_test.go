// Tests for "Did you mean...?" suggestions on unknown flags,
// matching the existing behavior for unknown commands.
package cobra

import (
	"strings"
	"testing"
)

func TestFlagSuggestionUnknownFlag(t *testing.T) {
	root := &Command{Use: "root", Run: emptyRun}
	root.Flags().String("output", "", "output file")
	root.Flags().Bool("verbose", false, "verbose output")

	_, err := executeCommand(root, "--outpu", "foo")
	if err == nil {
		t.Fatal("expected error for unknown flag --outpu")
	}

	errStr := err.Error()
	// The error should suggest the similar flag --output
	if !strings.Contains(errStr, "output") {
		t.Errorf("expected suggestion containing 'output', got: %s", errStr)
	}
	if !strings.Contains(strings.ToLower(errStr), "did you mean") {
		t.Errorf("expected 'Did you mean' in error message, got: %s", errStr)
	}
}

func TestFlagSuggestionNoCloseMatch(t *testing.T) {
	root := &Command{Use: "root", Run: emptyRun}
	root.Flags().String("output", "", "output file")

	_, err := executeCommand(root, "--zzzzz")
	if err == nil {
		t.Fatal("expected error for unknown flag --zzzzz")
	}

	// No close match exists — should NOT suggest anything
	if strings.Contains(strings.ToLower(err.Error()), "did you mean") {
		t.Errorf("should not suggest when no close match, got: %s", err.Error())
	}
}

func TestFlagSuggestionDisabled(t *testing.T) {
	root := &Command{
		Use:                "root",
		Run:                emptyRun,
		DisableSuggestions: true,
	}
	root.Flags().String("output", "", "output file")

	_, err := executeCommand(root, "--outpu")
	if err == nil {
		t.Fatal("expected error for unknown flag")
	}

	// DisableSuggestions should suppress flag suggestions too
	if strings.Contains(strings.ToLower(err.Error()), "did you mean") {
		t.Errorf("suggestions should be disabled, got: %s", err.Error())
	}
}
