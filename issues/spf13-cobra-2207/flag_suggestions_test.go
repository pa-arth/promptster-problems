// Tests for "Did you mean --<flag>?" suggestions on unknown flags, matching
// the existing behavior cobra provides for unknown subcommands.
//
// At brokenSha (61968e8) cobra has no flag-suggestion feature at all — the
// unknown-flag error goes straight through pflag. A correct fix intercepts
// pflag's error for --<name> and appends a Levenshtein-based suggestion,
// gated by SuggestionsMinimumDistance and suppressed by DisableSuggestions.
package cobra

import (
	"strings"
	"testing"
)

func TestFlagSuggestionUnknownFlag(t *testing.T) {
	tests := []struct {
		name        string
		setup       func(*Command)
		args        []string
		wantContain []string // all substrings must appear in error
	}{
		{
			name: "simple typo produces a suggestion for the correct flag",
			setup: func(c *Command) {
				c.Flags().String("output", "", "output file")
				c.Flags().Bool("verbose", false, "verbose output")
			},
			args:        []string{"--outpu"},
			wantContain: []string{"unknown flag", "outpu", "Did you mean", "--output"},
		},
		{
			name: "transposition is caught via Levenshtein distance",
			setup: func(c *Command) {
				c.Flags().String("output", "", "output file")
			},
			args:        []string{"--ouptut"},
			wantContain: []string{"Did you mean", "--output"},
		},
		{
			name: "prefix match suggests a longer flag name",
			setup: func(c *Command) {
				c.Flags().String("output", "", "output file")
				c.Flags().Bool("outside", false, "unused")
			},
			args:        []string{"--out"},
			wantContain: []string{"Did you mean", "--out"}, // at least one of the two
		},
		{
			name: "unknown flag with VALUE still produces a suggestion",
			setup: func(c *Command) {
				c.Flags().String("output", "", "output file")
			},
			// pflag may report "--outpu=foo" or "--outpu foo" depending on form;
			// either way the typed name alone should drive the suggestion.
			args:        []string{"--outpu=foo"},
			wantContain: []string{"Did you mean", "--output"},
		},
		{
			name: "persistent flag defined on parent is suggested from subcommand",
			setup: func(c *Command) {
				c.PersistentFlags().String("output", "", "shared flag")
				sub := &Command{Use: "sub", Run: emptyRun}
				c.AddCommand(sub)
			},
			args:        []string{"sub", "--outpu"},
			wantContain: []string{"Did you mean", "--output"},
		},
		{
			name: "suggestion respects multiple candidates",
			setup: func(c *Command) {
				c.Flags().String("output", "", "")
				c.Flags().String("outlet", "", "")
				c.Flags().String("offset", "", "")
			},
			args:        []string{"--outp"},
			wantContain: []string{"Did you mean", "--output"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := &Command{Use: "root", Run: emptyRun}
			if tt.setup != nil {
				tt.setup(root)
			}
			_, err := executeCommand(root, tt.args...)
			if err == nil {
				t.Fatalf("expected error for args %v", tt.args)
			}
			errStr := err.Error()
			for _, sub := range tt.wantContain {
				if !strings.Contains(errStr, sub) {
					t.Errorf("expected error to contain %q, got:\n%s", sub, errStr)
				}
			}
		})
	}
}

func TestFlagSuggestionDoesNotAppearWhenNoCloseMatch(t *testing.T) {
	// This is a negative assertion — it PASSES at brokenSha (no feature at all
	// means no suggestion ever appears). Kept as a regression guard: a
	// subsequent "greedy" fix that suggests flags regardless of distance would
	// flip this test to FAIL.
	root := &Command{Use: "root", Run: emptyRun}
	root.Flags().String("output", "", "output file")

	_, err := executeCommand(root, "--zzzzzzzz")
	if err == nil {
		t.Fatal("expected error for unknown flag --zzzzzzzz")
	}
	if strings.Contains(strings.ToLower(err.Error()), "did you mean") {
		t.Errorf("should not suggest when no flag is within Levenshtein distance, got: %s", err.Error())
	}
}

func TestFlagSuggestionDisabledSuppressesSuggestion(t *testing.T) {
	// Also a negative assertion that passes at broken (no feature) — kept as a
	// guard that a future fix honors the DisableSuggestions knob.
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
	if strings.Contains(strings.ToLower(err.Error()), "did you mean") {
		t.Errorf("suggestions should be disabled, got: %s", err.Error())
	}
}

func TestFlagSuggestionOriginalErrorPreserved(t *testing.T) {
	// The enriched error must still contain the original "unknown flag" text
	// so downstream log parsers that key off that phrase continue to work.
	root := &Command{Use: "root", Run: emptyRun}
	root.Flags().String("output", "", "output file")

	_, err := executeCommand(root, "--outpu")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "unknown flag") {
		t.Errorf("original 'unknown flag' text must be preserved, got: %s", err.Error())
	}
}
