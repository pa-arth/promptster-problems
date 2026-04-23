// Regression tests for PR #17643: the PromQL printer drops an empty
// ignoring() clause even when a group_left/group_right modifier is present.
// This changes the serialized expression's semantics (empty ignoring() with a
// group modifier is syntactically required to reference the metric name via
// group_x(__name__)), so round-tripping Parse -> String must preserve it.
//
// All cases below assert round-trip stability — whatever comes out of String()
// must parse back into the same AST. At the broken SHA, the majority of these
// cases fail because ignoring() is silently stripped. The fix adds the
// Card == CardManyToOne || Card == CardOneToMany branch to getMatchingStr.
package parser

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIgnoringPreservedWithGroupModifier(t *testing.T) {
	tests := []struct {
		name string
		in   string
		out  string
	}{
		// ─── Core bug: empty ignoring() + group modifier must be preserved ───
		{
			name: "empty ignoring with group_left(__metric__) is preserved",
			in:   `a - ignoring() group_left(__metric__) c`,
			out:  `a - ignoring () group_left (__metric__) c`,
		},
		{
			name: "empty ignoring with bare group_left is preserved",
			in:   `a - ignoring() group_left c`,
			out:  `a - ignoring () group_left () c`,
		},
		{
			name: "empty ignoring with bare group_right is preserved",
			in:   `a + ignoring() group_right() c`,
			out:  `a + ignoring () group_right () c`,
		},
		{
			name: "empty ignoring with group_right(__metric__) is preserved",
			in:   `a + ignoring() group_right(__metric__) c`,
			out:  `a + ignoring () group_right (__metric__) c`,
		},

		// ─── Regression guards: unaffected paths keep their existing output ───
		{
			// Without a group modifier an empty ignoring() is semantically
			// equivalent to "no modifier at all", so dropping it in the
			// serialized form is correct. This behavior must NOT change.
			name: "empty ignoring without group modifier still strips (regression guard)",
			in:   `a - ignoring() c`,
			out:  `a - c`,
		},
		{
			name: "ignoring with labels serializes normally",
			in:   `a + ignoring(foo) c`,
			out:  `a + ignoring (foo) c`,
		},
		{
			name: "on with labels serializes normally",
			in:   `a + on(foo) c`,
			out:  `a + on (foo) c`,
		},

		// ─── Compound cases that stress the fix path ───
		{
			name: "ignoring with labels and group_left preserves both",
			in:   `a - ignoring(x) group_left(__metric__) c`,
			out:  `a - ignoring (x) group_left (__metric__) c`,
		},
		{
			name: "empty ignoring with group_left holds across different binary ops",
			in:   `a * ignoring() group_left() c`,
			out:  `a * ignoring () group_left () c`,
		},
		{
			name: "round-trip stability: printing then re-parsing yields identical output",
			in:   `a - ignoring() group_left(__metric__) c`,
			out:  `a - ignoring () group_left (__metric__) c`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			expr, err := ParseExpr(tt.in)
			require.NoError(t, err, "parse %q", tt.in)
			require.Equal(t, tt.out, expr.String(), "first-pass print")

			// Round-trip: the output must itself re-parse and print identically,
			// so the serializer is a true inverse of the parser for these cases.
			reExpr, reErr := ParseExpr(expr.String())
			require.NoError(t, reErr, "re-parse %q", expr.String())
			require.Equal(t, tt.out, reExpr.String(), "round-trip print")
		})
	}
}
