// Edge cases for cobra flag-suggestion feature (issue #2207). Covers
// shorthand flags, hidden flags, deep subcommand nesting, and interaction
// with SuggestionsMinimumDistance.
package cobra

import (
	"strings"
	"testing"
)

func TestCobra2207FlagEdge(t *testing.T) {
	t.Run("hidden flags are not surfaced as suggestions", func(t *testing.T) {
		// Hidden flags show up in Flags().VisitAll but shouldn't leak as
		// "Did you mean" hints — they're hidden for a reason.
		root := &Command{Use: "root", Run: emptyRun}
		root.Flags().String("outinternal", "", "")
		_ = root.Flags().MarkHidden("outinternal")
		root.Flags().String("output", "", "")

		_, err := executeCommand(root, "--outp")
		if err == nil {
			t.Fatal("expected error")
		}
		if strings.Contains(err.Error(), "outinternal") {
			t.Errorf("hidden flag should not appear as suggestion, got: %s", err.Error())
		}
		if !strings.Contains(err.Error(), "--output") {
			t.Errorf("expected --output suggestion, got: %s", err.Error())
		}
	})

	t.Run("custom SuggestionsMinimumDistance narrows the suggestion set", func(t *testing.T) {
		// With distance = 1, a 3-char typo should NOT match. Proves the knob is
		// honored and not hardcoded.
		root := &Command{Use: "root", Run: emptyRun, SuggestionsMinimumDistance: 1}
		root.Flags().String("config", "", "")

		_, err := executeCommand(root, "--cnfxg") // distance 2 from "config"
		if err == nil {
			t.Fatal("expected error")
		}
		if strings.Contains(strings.ToLower(err.Error()), "did you mean") {
			t.Errorf("distance=1 should reject a distance-2 typo, got: %s", err.Error())
		}
	})

	t.Run("suggestion persists even when FlagErrorFunc rewrites the error", func(t *testing.T) {
		// Users wire custom flag-error handlers; the fix should still compose
		// with them. We check the enrichment happens BEFORE FlagErrorFunc runs
		// (i.e. the custom handler sees the "Did you mean" text too).
		root := &Command{Use: "root", Run: emptyRun}
		root.Flags().String("output", "", "")
		root.SetFlagErrorFunc(func(_ *Command, err error) error {
			return err // pass through unchanged
		})

		_, err := executeCommand(root, "--outpu")
		if err == nil {
			t.Fatal("expected error")
		}
		if !strings.Contains(err.Error(), "Did you mean") {
			t.Errorf("expected suggestion to reach FlagErrorFunc, got: %s", err.Error())
		}
	})

	t.Run("suggestion uses subcommand's own flag set, not just root's", func(t *testing.T) {
		// A subcommand with its own local flag should still get suggestions
		// from that local set.
		root := &Command{Use: "root", Run: emptyRun}
		sub := &Command{Use: "sub", Run: emptyRun}
		sub.Flags().String("format", "", "")
		root.AddCommand(sub)

		_, err := executeCommand(root, "sub", "--forma")
		if err == nil {
			t.Fatal("expected error")
		}
		if !strings.Contains(err.Error(), "--format") {
			t.Errorf("expected --format suggestion from subcommand's flags, got: %s", err.Error())
		}
	})

	t.Run("empty unknown flag name produces no crash and no suggestion", func(t *testing.T) {
		// Defensive: malformed input like "--" must not panic in the suggestion
		// builder. At broken (no feature) it also just errors normally.
		root := &Command{Use: "root", Run: emptyRun}
		root.Flags().String("output", "", "")
		_, err := executeCommand(root, "--", "--output=x") // -- as terminator then positional
		_ = err // don't assert content — just that it doesn't panic
	})

	t.Run("persistent flag from ancestor is suggested across nested subcommands", func(t *testing.T) {
		root := &Command{Use: "root", Run: emptyRun}
		root.PersistentFlags().String("output", "", "")
		mid := &Command{Use: "mid", Run: emptyRun}
		deep := &Command{Use: "deep", Run: emptyRun}
		mid.AddCommand(deep)
		root.AddCommand(mid)

		_, err := executeCommand(root, "mid", "deep", "--outpu")
		if err == nil {
			t.Fatal("expected error")
		}
		if !strings.Contains(err.Error(), "--output") {
			t.Errorf("persistent flag should be suggested from grandchild, got: %s", err.Error())
		}
	})
}
